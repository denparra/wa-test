import 'dotenv/config';
import express from 'express';

const app = express();
const PORT = process.env.PORT || 3000;


app.use(express.urlencoded({ extended: false })); // Twilio envía form-urlencoded

app.post('/twilio/inbound', (req, res) => {
    const from = req.body.From;            // "whatsapp:+569..."
    const body = (req.body.Body || '').trim(); // texto del usuario

    console.log('INBOUND:', { from, body });

    const upper = body.toUpperCase();

    // Respuesta simple
    let reply = 'Gracias por escribir a Queirolo Autos. Responde:\n1) Me interesa consignar\n2) Quiero mas info\n3) BAJA';


    if (body === 'BAJA' || body === '3') {
        reply = 'Listo. Te daremos de baja y no volveremos a contactarte por este canal.';
    } else if (body === '1' || body.includes('CONSIGN')) {
        reply = 'Perfecto. Para avanzar, dime: Marca, Modelo, Ano y Comuna.';
    } else if (body === '2' || body.includes('INFO')) {
        reply = 'Genial. Te cuento: consignamos, publicamos y gestionamos todo. Quieres que te llame un ejecutivo? (SI/NO)';
    }

    res
        .status(200)
        .type('text/xml')
        .send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${escapeXml(reply)}</Message>
</Response>`);
});

function escapeXml(str = '') {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}


app.get('/health', (_, res) => res.status(200).send('ok'));

app.listen(PORT, () => console.log('Listening on', PORT));