'use strict';

require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const app = express().use(bodyParser.json()); // creates http server

const token = process.env.VAPI_TOKEN;
const applicationId = process.env.MOESIF_APP_ID;
const vapiApiUrl = 'https://api.vapi.ai/call';
const vapiOutboundUrl = 'https://api.vapi.ai/call/phone';
const stripeMeterApiUrl = 'https://api.stripe.com/v1/billing/meter_events';
const moesifApiUrl = 'https://api.moesif.net/v1/actions';

app.get('/', (req, res) => {
    return res.sendStatus(200);
});

app.post('/webhook', (req, res) => {
    // check if verification token is correct
    const vapiSecretToken = req.headers['x-vapi-secret'];

    if (vapiSecretToken !== token) {
        return res.sendStatus(401);
    }

    const callStatus = req.body.message.type || '';
    if(callStatus === "end-of-call-report")
    {
        var callID = req.body.message.call.id || '';
        //callID = "c9ea9b10-f5ab-4c68-89e2-e859aaca2182";
        fetch(`${vapiApiUrl}/${callID}`, {
            method: 'get',
            headers: new Headers({
                'Authorization': `Bearer ${process.env.VAPI_PRIVATE_KEY}`,
                'Content-Type': 'application/json'
            }),
        })
        .then(res => res.json())
        .then(resObj => {
            const assistantId = resObj?.assistantId;
            const startTime = resObj.startedAt;
            const endTime = resObj.endedAt;
            const duration = getDuration(startTime, endTime);
            const cost =  resObj.cost.toFixed(2);
            const phoneNumber = resObj?.customer?.number || '';
            const customer_email = resObj?.customer?.name || '';
            const customer_id = resObj?.metadata?.customerId || '';
            const subscription_id = resObj?.metadata?.subscriptionId || '';

            const data = {
              action_name: 'VAPI CALL Ended',
              company_id: customer_id,
              subscription_id: subscription_id,
              request: {
                time: new Date().toISOString()
              },
              metadata: {
                assistant_id: assistantId,
                customer_id: customer_id,
                customer_email: customer_email,
                call_id: callID,
                phone_number: phoneNumber,
                cost: cost,
                duration_minutes: duration.minutes,
                duration_seconds: duration.seconds,
                duration_total_minutes: duration.total_minutes
              }
            };

            const stripeApiHeader =  {
              'Authorization': `Bearer ${process.env.STRIPE_KEY}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            };

            const urlencoded = new URLSearchParams();
            urlencoded.append("event_name", process.env.STRIPE_METER_NAME);
            urlencoded.append("payload[stripe_customer_id]", customer_id);
            urlencoded.append("payload[value]", duration.total_minutes);

            fetch(stripeMeterApiUrl, {
              method: 'POST',
              headers: stripeApiHeader,
              body: urlencoded
            })
            .then(res => res.json())
            .then(resObj => {
              const headers = {
                'Content-Type': 'application/json',
                'X-Moesif-Application-Id': applicationId
              };

              fetch(moesifApiUrl, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(data)
              })
              .then(response => {
                if (response.ok) {
                  return res.json({
                    status: true,
                });
                  console.log('Moesif API Request successful');
                } else {
                  return res.json({
                    status: false,
                });
                  console.error('Moesif API Request failed:', response.status);
                }
              })
              .catch(error => {
                console.error('Error:', error);
              });
            })
            .catch(error => {
              console.error('Error:', error);
            });
        })
        .catch(error => console.error('VAPI API Calling Error: ', error));
    }
});

app.post('/outbound', async (req, res) => {
  // Extract data from the request body
  const { phoneNumberId, assistantId, customerId, subScriptionId, customerEmail, customerNumber } = req.body;
  try {
    // Make a POST request to the Vapi API
    const response = await fetch(
      vapiOutboundUrl,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.VAPI_PRIVATE_KEY}`,
        },
        body: JSON.stringify({
          phoneNumberId,
          assistantId,
          customer: {
            name: customerEmail,
            number: customerNumber
          },
          metadata: {
            customerId: customerId,
            subscriptionId: subScriptionId
          }
        })
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }

    // Parse the response data as JSON
    const data = await response.json();

    // Send the response data as JSON
    res.status(200).json(data);
  } catch (error) {
    // Handle errors
    res.status(500).json({ message: 'Failed to place outbound call', error: error.message });
  }
});

function getDuration(startTime = '', endTime = '')
{
    // Convert the strings to Date objects
    const start = new Date(startTime);
    const end = new Date(endTime);

    // Calculate the duration in milliseconds
    const durationMs = end.getTime() - start.getTime();

    // Convert the duration to seconds
    const durationSeconds = durationMs / 1000;
    // Calculate minutes and seconds
    let minutes = Math.floor(durationSeconds / 60);
    let seconds = Math.round(durationSeconds % 60);
    let total_minutes = minutes;
    if(seconds > 0)
    {
      total_minutes++;
    }
    return {minutes, seconds, total_minutes}
}

app.listen(3000, () => console.log('VAPI Webhook is listening'));
