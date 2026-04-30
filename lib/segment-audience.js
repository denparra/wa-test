export function createBadRequestError(message) {
    const error = new Error(message);
    error.statusCode = 400;
    return error;
}

function parseStoredFilters(rawFilters = {}) {
    if (!rawFilters) {
        return {};
    }

    if (typeof rawFilters === 'string') {
        try {
            return JSON.parse(rawFilters || '{}');
        } catch (_) {
            return {};
        }
    }

    return typeof rawFilters === 'object' ? { ...rawFilters } : {};
}

function normalizeText(value) {
    const text = String(value ?? '').trim();
    return text ? text : null;
}

function normalizeYear(value) {
    if (value === null || value === undefined || value === '') {
        return null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function hasRawValue(value) {
    return value !== null && value !== undefined && String(value).trim() !== '';
}

export function normalizeAudienceFilters(rawFilters = {}) {
    const filters = parseStoredFilters(rawFilters);
    const source = filters.source === 'contacts' ? 'contacts' : 'vehicles';
    const mode = filters.mode === 'manual' ? 'manual' : 'dynamic';
    const segmentIdRaw = Number(filters.segmentId || 0);

    return {
        source,
        mode,
        segmentId: Number.isInteger(segmentIdRaw) && segmentIdRaw > 0 ? segmentIdRaw : null,
        make: normalizeText(filters.make),
        model: normalizeText(filters.model),
        query: source === 'contacts' ? String(filters.query || '').trim() : '',
        yearMin: normalizeYear(filters.yearMin),
        yearMax: normalizeYear(filters.yearMax)
    };
}

export function validateSegmentDefinition(rawFilters = {}, { expectedSource = null } = {}) {
    const normalized = normalizeAudienceFilters(rawFilters);
    const vehicleInputs = [normalized.make, normalized.model, normalized.yearMin, normalized.yearMax];
    const hasVehicleFilters = vehicleInputs.some((value) => value !== null && value !== undefined && value !== '');
    const raw = parseStoredFilters(rawFilters);

    if (hasRawValue(raw.yearMin) && normalized.yearMin === null) {
        throw createBadRequestError('Year range is invalid');
    }
    if (hasRawValue(raw.yearMax) && normalized.yearMax === null) {
        throw createBadRequestError('Year range is invalid');
    }
    if (normalized.yearMin !== null && normalized.yearMax !== null && normalized.yearMin > normalized.yearMax) {
        throw createBadRequestError('Year range is invalid');
    }

    if (expectedSource && normalized.source !== expectedSource) {
        throw createBadRequestError(`Segment source mismatch: expected ${expectedSource}`);
    }

    if (normalized.source === 'contacts' && hasVehicleFilters) {
        throw createBadRequestError('Contacts segments do not accept vehicle filters');
    }

    if (normalized.source === 'vehicles' && hasRawValue(raw.query)) {
        throw createBadRequestError('Vehicles segments do not accept contact query filters');
    }

    return normalized;
}

export function resolveAudienceCandidatesFromFns(fns, { source = 'vehicles', filters = {}, limit = 10000 } = {}) {
    const safeLimit = Math.max(1, Math.min(Number(limit) || 10000, 10000));
    const requested = validateSegmentDefinition({ source, ...filters });
    const segment = requested.segmentId ? fns.getSegmentById(requested.segmentId) : null;

    if (requested.segmentId && !segment) {
        throw new Error('Segment not found');
    }

    const segmentFilters = segment ? validateSegmentDefinition(segment.filters) : null;
    const mode = requested.segmentId && segmentFilters?.mode === 'manual'
        ? 'manual'
        : requested.mode;
    const resolvedSource = requested.segmentId
        ? segmentFilters.source
        : requested.source;

    if (requested.segmentId && requested.source !== segmentFilters.source) {
        requested.source = segmentFilters.source;
    }

    if (mode === 'manual') {
        const total = requested.segmentId ? fns.countSegmentMembers(requested.segmentId) : 0;
        const candidates = requested.segmentId
            ? fns.listSegmentRecipientTargets(requested.segmentId, { limit: safeLimit })
            : [];

        return {
            mode,
            source: resolvedSource,
            total,
            candidates,
            segmentId: requested.segmentId,
            segment,
            filters: {
                source: resolvedSource,
                mode,
                segmentId: requested.segmentId
            }
        };
    }

    if (resolvedSource === 'contacts') {
        const query = String(requested.query || segmentFilters?.query || '').trim();
        const candidates = fns.listContactsForCampaign({ query, limit: safeLimit }).map((contact) => ({
            ...contact,
            contact_id: contact.contact_id || contact.id
        }));
        const total = fns.countContactsForCampaign({ query });

        return {
            mode,
            source: resolvedSource,
            total,
            candidates,
            segmentId: requested.segmentId,
            segment,
            filters: {
                source: resolvedSource,
                mode,
                segmentId: requested.segmentId,
                query
            }
        };
    }

    const effectiveFilters = {
        make: requested.make,
        model: requested.model,
        yearMin: requested.yearMin,
        yearMax: requested.yearMax
    };
    const candidates = fns.listVehicleContactsByFilters({ ...effectiveFilters, limit: safeLimit });
    const total = fns.countVehicleAudienceByFilters(effectiveFilters);

    return {
        mode,
        source: resolvedSource,
        total,
        candidates,
        segmentId: requested.segmentId,
        segment,
        filters: {
            source: resolvedSource,
            mode,
            segmentId: requested.segmentId,
            ...effectiveFilters
        }
    };
}
