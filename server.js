const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const https = require('https');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.json());
app.use(express.static(__dirname));

let currentBaseLat = -17.0822;
let currentBaseLng = -40.9352;
const activeTargets = {};

app.post('/api/update-base', (req, res) => {
    const { lat, lng } = req.body;
    if (lat && lng) {
        currentBaseLat = parseFloat(lat);
        currentBaseLng = parseFloat(lng);
        console.log(`[BASE MÓVEL REPOSICIONADA] Nova Coordenada: Lat ${currentBaseLat}, Lng ${currentBaseLng}`);
    }
    res.send({ status: 'SUCCESS', baseLat: currentBaseLat, baseLng: currentBaseLng });
});

app.post('/api/telemetry', (req, res) => {
    const data = req.body;
    const targetId = data.id || `ALVO-${Math.floor(Math.random() * 100)}`;
    
    activeTargets[targetId] = {
        id: targetId,
        type: data.type || "DRONE",
        status: data.status || "VERIFIED",
        lat: parseFloat(data.lat),
        lng: parseFloat(data.lng),
        altitude: data.altitude || 47,
        speed: data.speed || 16,
        heading: data.heading || 160,
        source: data.source || "Sensor RF / Multi-Radar",
        timestamp: new Date().toLocaleTimeString()
    };

    io.emit('target-update', activeTargets[targetId]);
    res.send({ status: 'SUCCESS', message: 'Alvo processado' });
});

function fetchMannedAviation() {
    const lamin = currentBaseLat - 0.5;
    const lamax = currentBaseLat + 0.5;
    const lomin = currentBaseLng - 0.5;
    const lomax = currentBaseLng + 0.5;

    const url = `https://opensky-network.org/api/states/all?lamin=${lamin}&lamax=${lamax}&lomin=${lomin}&lomax=${lomax}`;

    https.get(url, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            try {
                const response = JSON.parse(data);
                if (response && response.states) {
                    response.states.forEach(flight => {
                        const flightId = flight[1] ? flight[1].trim() : `AIR-${flight[0]}`;
                        if (flight[5] && flight[6]) {
                            activeTargets[flightId] = {
                                id: flightId,
                                type: "AVIAO_COMERCIAL",
                                status: "VERIFIED",
                                lat: flight[6],
                                lng: flight[5],
                                altitude: flight[7] ? Math.round(flight[7]) : 1000,
                                speed: flight[9] ? Math.round(flight[9] * 3.6) : 0,
                                heading: flight[10] || 0,
                                source: "OpenSky ADS-B",
                                timestamp: new Date().toLocaleTimeString()
                            };
                            io.emit('target-update', activeTargets[flightId]);
                        }
                    });
                }
            } catch (e) {}
        });
    }).on('error', () => {});
}

setInterval(fetchMannedAviation, 15000);

io.on('connection', (socket) => {
    socket.emit('init-base', { lat: currentBaseLat, lng: currentBaseLng });
    Object.values(activeTargets).forEach(target => {
        socket.emit('target-update', target);
    });
});

// Porta dinâmica para servidores em nuvem (Render, Railway, etc.)
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`==================================================`);
    console.log(` CENTRAL TÁTICA MÓVEL ATIVA NA PORTA ${PORT}     `);
    console.log(`==================================================`);
});