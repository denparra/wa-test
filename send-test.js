import 'dotenv/config';
import twilio from 'twilio';

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// Cambia por tu número de prueba (formato E.164)
const TO = 'whatsapp:+56975400946';

async function main() {
    const msg = await client.messages.create({
        to: TO,
        messagingServiceSid: process.env.MESSAGING_SERVICE_SID,
        contentSid: process.env.CONTENT_SID,

        // Si tu plantilla NO usa variables, puedes borrar estas 2 líneas:
        contentVariables: JSON.stringify({
            "1": "Dennys"
        }),
    });

    console.log('Sent! SID:', msg.sid, 'TO:', TO);
}

main().catch((err) => {
    console.error('Error:', err?.message || err);
    if (err?.code) console.error('Twilio code:', err.code);
});
