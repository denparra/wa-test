import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import {
    insertVehicle,
    isOptedOut,
    normalizePhone,
    upsertContact,
    updateContactStatus
} from '../db/index.js';

function parseArgs(argv) {
    const args = {
        file: null,
        help: false
    };

    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--help' || arg === '-h') {
            args.help = true;
            continue;
        }
        if (arg === '--file' && argv[i + 1]) {
            args.file = argv[i + 1];
            i += 1;
            continue;
        }
        if (arg.startsWith('--file=')) {
            args.file = arg.split('=').slice(1).join('=');
        }
    }

    return args;
}

function parseCsvLine(line) {
    const values = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
        const char = line[i];
        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i += 1;
                continue;
            }
            inQuotes = !inQuotes;
            continue;
        }
        if (char === ',' && !inQuotes) {
            values.push(current);
            current = '';
            continue;
        }
        current += char;
    }

    values.push(current);
    return values.map((value) => value.trim());
}

function maskPhone(phoneE164 = '') {
    if (!phoneE164) {
        return '';
    }
    const visible = phoneE164.slice(-4);
    return `${phoneE164.slice(0, Math.max(0, phoneE164.length - 4)).replace(/\d/g, '*')}${visible}`;
}

function parseNumber(value) {
    if (value === null || value === undefined) {
        return null;
    }
    const cleaned = String(value).replace(/[^\d.]/g, '');
    if (!cleaned) {
        return null;
    }
    const parsed = Number(cleaned);
    return Number.isNaN(parsed) ? null : parsed;
}

function parseInteger(value) {
    const parsed = parseNumber(value);
    if (parsed === null) {
        return null;
    }
    return Number.isInteger(parsed) ? parsed : Math.trunc(parsed);
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    if (args.help || !args.file) {
        console.log('Uso: node scripts/import-csv.js --file ./leads.csv');
        return;
    }

    const filePath = path.resolve(process.cwd(), args.file);
    if (!fs.existsSync(filePath)) {
        console.error('Archivo no encontrado:', filePath);
        return;
    }

    const raw = fs.readFileSync(filePath, 'utf8');
    const lines = raw.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim());
    if (lines.length === 0) {
        console.error('CSV vacio.');
        return;
    }

    const header = parseCsvLine(lines[0]).map((value) => value.toLowerCase());
    const columnIndex = {
        telefono: header.indexOf('telefono'),
        nombre: header.indexOf('nombre'),
        marca: header.indexOf('marca'),
        modelo: header.indexOf('modelo'),
        anio: header.indexOf('anio'),
        precio: header.indexOf('precio'),
        link: header.indexOf('link')
    };

    const missingColumns = Object.entries(columnIndex)
        .filter(([, index]) => index === -1)
        .map(([key]) => key);

    if (missingColumns.length > 0) {
        console.error('Faltan columnas requeridas:', missingColumns.join(', '));
        return;
    }

    let inserted = 0;
    let skipped = 0;
    let invalid = 0;

    for (let i = 1; i < lines.length; i += 1) {
        const row = parseCsvLine(lines[i]);
        const rawPhone = row[columnIndex.telefono] || '';
        const phoneE164 = normalizePhone(rawPhone);
        const name = row[columnIndex.nombre] || null;
        const brand = row[columnIndex.marca] || null;
        const model = row[columnIndex.modelo] || null;
        const year = parseInteger(row[columnIndex.anio]);
        const price = parseNumber(row[columnIndex.precio]);
        const link = row[columnIndex.link] || null;

        if (!phoneE164 || !brand || !model || !year) {
            invalid += 1;
            console.warn(`Fila ${i + 1} invalida (faltan campos).`);
            continue;
        }

        const optedOut = isOptedOut(phoneE164);
        if (optedOut) {
            updateContactStatus(phoneE164, 'opted_out');
            skipped += 1;
            console.log(`Fila ${i + 1} omitida (opt-out) ${maskPhone(phoneE164)}.`);
            continue;
        }

        let contact = null;
        try {
            contact = upsertContact(phoneE164, name);
        } catch (error) {
            invalid += 1;
            console.warn(`Fila ${i + 1} invalida (contacto).`);
            continue;
        }

        if (!contact?.id) {
            invalid += 1;
            console.warn(`Fila ${i + 1} invalida (contacto).`);
            continue;
        }

        try {
            insertVehicle({
                contactId: contact.id,
                brand,
                model,
                year,
                price,
                link
            });
            inserted += 1;
        } catch (error) {
            invalid += 1;
            console.warn(`Fila ${i + 1} invalida (vehiculo).`);
        }
    }

    console.log(`Import finalizado. Insertados: ${inserted}, Omitidos: ${skipped}, Invalidos: ${invalid}`);
}

main();
