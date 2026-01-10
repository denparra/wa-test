import 'dotenv/config';
import twilio from 'twilio';

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// Cambia por tu número de prueba (formato E.164)
// Cambia por tus números de prueba (formato E.164)
const RECIPIENTS = [
    'whatsapp:+56975400946',
    'whatsapp:+56990080338', // Agrega aquí el segundo número
    'whatsapp:+56983785269', // Agrega aquí el segundo número
    'whatsapp:+56958012294',
    'whatsapp:+56989573774'  // Agrega aquí el tercer número
];

async function main() {
    console.log('Enviando mensajes a', RECIPIENTS.length, 'destinatarios...');

    const results = await Promise.allSettled(RECIPIENTS.map(async (to) => {
        const msg = await client.messages.create({
            to: to,
            messagingServiceSid: process.env.MESSAGING_SERVICE_SID,
            contentSid: process.env.CONTENT_SID,

            // Si tu plantilla NO usa variables, puedes borrar estas 2 líneas:
            contentVariables: JSON.stringify({
                "1": "Dennys"
            }),
        });
        return { to, sid: msg.sid };
    }));

    results.forEach((result, index) => {
        const to = RECIPIENTS[index];
        if (result.status === 'fulfilled') {
            console.log(`✅ Enviado a ${to} - SID: ${result.value.sid}`);
        } else {
            console.error(`❌ Error enviando a ${to}:`, result.reason?.message || result.reason);
        }
    });
}

main().catch((err) => {
    console.error('Error:', err?.message || err);
    if (err?.code) console.error('Twilio code:', err.code);
});
