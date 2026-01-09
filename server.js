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

    if (upper.includes('BAJA') || upper.includes('STOP')) {
        console.log('-> OPT OUT (BAJA)');
        // siguiente paso: guardar opt_out en CSV
    } else if (upper.includes('ME INTERESA') || upper.includes('INTERESA')) {
        console.log('-> INTERESTED');
        // siguiente paso: guardar interesado en CSV
    } else {
        console.log('-> OTHER');
    }

    res.status(200).send('OK');
});

app.get('/health', (_, res) => res.status(200).send('ok'));

app.listen(PORT, () => console.log('Listening on', PORT));