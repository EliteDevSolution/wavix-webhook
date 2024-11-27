'use strict';

require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const app = express().use(bodyParser.json()); // creates http server

const applicationId = process.env.WAVBIX_APP_ID;
const wavixApiUrl = 'https://api.wavix.com/v1';
const thirdPartyApiUrl = 'https://integrav5-servicios-respaldo.bsginstitute.com/api';

app.get('/', (req, res) => {
    return res.sendStatus(200);
});

app.post('/webhook', async (req, res) => {
  const { uuid, disposition, direction, answered_by, destination, from, to } = req.body;
  const status = disposition || "";
  let amd_type = answered_by || "unknown";
  let sip = "";

  if (direction === "inbound") sip = destination;

  try {
      const wavixResponse = await fetch(`${wavixApiUrl}/cdr/${uuid}?appid=${applicationId}`);
      const responseData = await wavixResponse.json();

      if (responseData.uuid) {
          if (direction === "outbound") {
              amd_type = responseData.answered_by || "unknown";
              sip = responseData.sip_trunk || "";
          }
          //const duration = responseData.duration || 0;
          //const charge = responseData.charge || 0;
          //const call_date = responseData.date || "";
          const postData = {
              "Uuid": uuid,
              "EstadoLlamada": amd_type,
              "OcurrenciaLlamada": status,
              "TroncalSIP": sip,
              "Direccion": direction,
              "Destino": to,
              "Origen": from,
          };

          console.log('Wavix Call Webhook Received:', postData);
          const myHeaders = new Headers();
          myHeaders.append("Content-Type", "application/json");

          const requestOptions = {
            method: "POST",
            headers: myHeaders,
            body: JSON.stringify(postData),
            redirect: "follow"
          };
          // Third Party API Call
          const thirdPartyResponse = await fetch(`${thirdPartyApiUrl}/Comercial/Wavix/ProcesarEstadoLlamada`, requestOptions);
          const thirdPartyData = await thirdPartyResponse.json();
          console.log('Third Party API Response:', thirdPartyData);
          res.status(200).json({ status: true, ...thirdPartyData });
      } else {
          res.status(500).json({ status: false, message: 'Webhook handled error' });
      }
  } catch (error) {
      console.error('Error:', error);
      res.status(500).json({ status: false, message: 'Webhook handled error' });
  }
});

export default app;