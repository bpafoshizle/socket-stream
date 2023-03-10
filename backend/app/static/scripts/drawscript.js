function listenEvents(env) {
    const alertTimeout = 5000;
    const localUrl = 'ws://localhost:8080/eventsub';
    const prodUrl = 'wss://eventsub-beta.wss.twitch.tv/ws';
    const initialUrl = ((env === 'DEV') ? localUrl: prodUrl);
    let twitchUserName = 'bpafoshizle'; 
    let eventTypes = ['channel.follow', 'channel.subscribe'];
    let ws;
    let wsClosing;
    let sessionId; // will be set after session_welcome
    let keepAliveInterval; // will be set after session_welcome
    let lastKeepAliveTimestamp; // set after session_keepalive or notification
    let reconnect = false;

    function connect(url=initialUrl, reconnect=false) {
        console.log(`connecting to ${url}`);
        reconnect = reconnect;
        ws = new WebSocket(url);
    }
    connect();

    async function subscribeToEvents() {
        if(!reconnect) {
            const response = await fetch("/subscribe", {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    "types": eventTypes,
                    "username": twitchUserName,
                    "session_id": sessionId
                })
            });
            console.log(response.json());
        } else {
            console.log('reconnect, skipping subscribe')
        }
    }

    ws.onopen = () => {
        console.log('connected to eventsub');
    };
    ws.onmessage = event => {
        const data = JSON.parse(event.data);
        if(data.metadata.message_type === 'session_welcome') {
            let payload = data.payload;
            sessionId = payload.session.id
            console.log(`session id: ${sessionId}`)
            keepAliveInterval = payload.session.keepalive_timeout_seconds;
            if(reconnect) {
                console.log('reconnect welcome recieved, skipping subscribe. closing old connection')
                wsClosing.close()
            } else {
                subscribeToEvents();
            }

        }
        else if(data.metadata.message_type === 'session_keepalive'){
            console.log(`keepalive received. timestamp: ${data.metadata.message_timestamp}`)
            lastKeepAliveTimestamp = data.metadata.message_timestamp;
        }
        else if(data.metadata.message_type === 'session_reconnect') {
            console.log(`reconnecting to eventsub at ${data.payload.session.reconnect_url}`);
            wsClosing = ws;
            setTimeout(() => {
                connect(data.payload.session.reconnect_url, true)
            }, 1000);
        }
        else if(data.metadata.message_type === 'notification') {
            lastKeepAliveTimestamp = data.metadata.message_timestamp;
            let payload = data.payload;
            let eventType = payload.subscription.type;
            let username = payload.event.broadcaster_user_name;
            let alertImageId = null;
            let textStyle = null;
            if(eventType === 'channel.follow') {
                alertImageId = 'twitch-new-follower-img';
                textStyle = '#6441a4';
                eventAlertBox(username, alertImageId, textStyle, alertTimeout);
            }
            else if(eventType === 'channel.subscribe') {
                alertImageId = 'twitch-new-subscriber-img';
                textStyle = '#6441a4';
                eventAlertBox(username, alertImageId, textStyle, alertTimeout);
            }
        }
    };
    ws.onerror = error => {
        console.log('error: ', error);
    };
    ws.onclose = () => {
        console.log('disconnected from eventsub');
    };
}

function eventAlertBox(username, alertImageId, textStyle, timeOut) {
    function calculateImgPlacement(imageId) {
        const canvas = document.querySelector('#bg-canvas');
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = textStyle;
        ctx.font = '56px Monaco';
        // const img = document.getElementById(imageId);
        const img = document.querySelector(`#${imageId}`);
        return {
            imgStartX: (canvas.width - img.width),
            imgStartY: (canvas.height - img.height),
            imgWidth: img.width,
            imgHeight: img.height,
            imgTextOffsetY: parseInt(img.dataset.textYOffset),
            imgTextOffsetX: parseInt(img.dataset.textXOffset),
            textWidth: ctx.measureText(username).width,
            alertAudioId: img.dataset.audioId
        }
    }
    const {
        imgStartX, 
        imgStartY, 
        imgWidth, 
        imgHeight, 
        imgTextOffsetY,
        imgTextOffsetX,
        textWidth,
        alertAudioId
     } = calculateImgPlacement(alertImageId);

    // console.log(`imgStartX: ${imgStartX}, imgStartY: ${imgStartY}, imgWidth: ${imgWidth}, imgHeight: ${imgHeight}, imgTextOffsetY: ${imgTextOffsetY}, imgTextOffsetX: ${imgTextOffsetX}, textWidth: ${textWidth}`)
    let alpha = 0;
    let fadeIn = true;

    // 60 frames per second * 2.5 seconds = 150 frames. 1/150 = 0.006666666666666667
    let fps = 60;
    let secondsToHalf = timeOut/2/1000;
    let framesToHalf = fps * secondsToHalf;
    let delta = 1/framesToHalf;
    let startTime = Date.now();

    let audio = document.querySelector(`#${alertAudioId}`);
    audio.play();
    
    function draw() {
        const canvas = document.querySelector('#bg-canvas');
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.globalAlpha = alpha;
        ctx.drawImage(document.querySelector(`#${alertImageId}`), imgStartX, imgStartY, imgWidth, imgHeight);
        ctx.fillText(
            username,
            imgStartX + imgTextOffsetX + (imgWidth - textWidth)/2, 
            imgStartY + imgTextOffsetY
        );
        if(fadeIn) {
            alpha += delta;
            if (alpha >= 1) {
                fadeIn = false;
                setTimeout(() => {
                    fadeIn = false;
                }, timeOut/2);
            }
        } else {
            alpha -= delta;
            if (alpha <= 0) {
                fadeIn = true;
                setTimeout(() => {
                    fadeIn = true;
                }, timeOut/2);
            }
        }
        if(Date.now() - startTime < timeOut) {
            requestAnimationFrame(draw);
        }
        else {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    }
    draw();
}

// DEBUGGING FUNCTIONS
const alertList = [
    ['HNDR', 'twitch-new-follower-img', '#6441a4'],
    ['EGriZZ', 'twitch-new-subscriber-img', '#6441a4'],
    ['NotLilBear', 'twitch-first-time-chat-img', '#6441a4'],
    ['KuHouse', 'twitch-new-donation-img', '#c0ffa9'],
]

function loopDrawAlert() {
    const timeOut = 5000;
    let alertIndex = 0;
    let requestId = null;

    function drawAlert() {
        eventAlertBox(alertList[alertIndex][0], alertList[alertIndex][1], alertList[alertIndex][2], timeOut, requestId);
        alertIndex = (alertIndex+1) % alertList.length;
        setTimeout(drawAlert, timeOut)
    }
    drawAlert();
}

function drawOneAlert() {
    const timeOut = 5000;
    let alertIndex = 0;
    eventAlertBox(alertList[alertIndex][0], alertList[alertIndex][1], alertList[alertIndex][2], timeOut);
}