// HTML elements
const $useVideoCheck = document.getElementById("use_video")
const $useAudioCheck = document.getElementById("use_audio")
const $startMediaButton = document.getElementById("start_media_button")
const $stopMediaButton = document.getElementById("stop_media_button")
const $connectButton = document.getElementById("connect_button")
const $disconnectButton = document.getElementById("disconnect_button")
const $localVideo = document.getElementById("local_video")
const $remoteContainer = document.getElementById("remote_container")
const $stateSpan = document.getElementById("state_span")

// All required variables for media, socket and mediasoup
let localStream = null
let socket = null
let clientId = null
let device = null
let producerTransport = null
let audioProducer = null
let videoProducer = null
let consumerTransport = null
let videoConsumers = {}
let audioConsumers = {}

$startMediaButton.addEventListener("click", ()=>{
    startMedia()
})

$stopMediaButton.addEventListener("click", ()=>{
    stopMedia()
})

$connectButton.addEventListener("click", ()=>{
    connect()
})

$disconnectButton.addEventListener("click", ()=>{
    disconnect()
})


// --------------- Socket io --------------------
function connectSocket(){
    if(socket){
        socket.close()
        socket = null
        clientId = null
    }

    return new Promise((resolve, reject)=>{
        socket = io.connect()

        socket.on("connect", (evt)=>{
            console.log("Socket connected")
        })

        socket.on("disconnect", (evt)=>{
            console.log("Socket disconnected", evt)
        })

        socket.on("error", (err)=>{
            console.log("Socket error", err)
            reject(err)
        })

        socket.on("message", (message)=>{
            console.log("Message received", message)
            if (message.type === 'welcome') {
                if (socket.id !== message.id) {
                    console.warn('WARN: something wrong with clientID', socket.io, message.id);
                }
      
                clientId = message.id;
                console.log('connected to server. clientId=' + clientId);
                resolve();
              }
              else {
                    console.error('UNKNOWN message from server:', message);
            }
        })

        socket.on("newProducer", ({ socketId, producerId, kind })=>{
            const remoteId = socketId
            console.log('--try consumeAdd remoteId=' + remoteId + ', producerId=' + producerId + ', kind=' + kind);
            consumeAdd(consumerTransport, remoteId, producerId, kind);
        })

        socket.on("producerClosed", ({ localId, remoteId, kind })=>{
            console.log('--try removeConsumer remoteId=%s, localId=%s, track=%s', remoteId, localId, kind);
            removeConsumer(remoteId, kind);
            removeRemoteVideoElement(remoteId);
        })
    })
}

function disconnectSocket(){
    if(socket){
        socket.close()
        socket = null
        clientId = null
        console.log("Socket IO closed")
    }
}

function isSocketConnected(){
    if(socket) return true
    return false
}

function sendRequest(type, data){
    return new Promise((resolve, reject)=>{
        socket.emit(type, data, (err, response)=>{
            if(!err){
                resolve(response)
            }else{
                reject(err)
            }
        })
    })
}

// --------------- Media Control -----------------
function stoplocalStream(stream){
    const tracks = stream.getTracks()
    if(!tracks){
        console.log("No Tracks")
    }
    tracks.forEach((track) => {
        track.stop()
    });
}

function playVideo(element, stream){
    if(element.srcObject){
        console.warn("Element already playing video")
        return
    }
    element.srcObject = stream
    element.volume = 0
    return element.play()
}

function pauseVideo(element){
    element.pause()
    element.srcObject = null
}

function addRemoteTrack(id, track){
    let $remoteVideo = findRemoteVideoElement(id)
    if(!$remoteVideo){
        $remoteVideo = addRemoteVideoElement(id)
        $remoteVideo.controls = "1"
    }

    if($remoteVideo.srcObject){
        $remoteVideo.srcObject.addTrack(track)
        return
    }

    const newStream = new MediaStream()
    newStream.addTrack(track)
    playVideo($remoteVideo, newStream)
        .then(() => { $remoteVideo.volume = "1" })
        .catch((err) => { console.log("Media error", err) })
}

function addRemoteVideoElement(id){
    let $remoteVideo = findRemoteVideoElement(id)
    if($remoteVideo){
        console.warn("WARN: Remote video already exists")
        return
    }

    $remoteVideo = document.createElement("video")
    $remoteVideo.id = "remote_"+id
    $remoteVideo.width = 240;
    $remoteVideo.height = 180;
    $remoteVideo.volume = 0;
    $remoteVideo.style = 'border: solid black 1px;';
    $remoteContainer.appendChild($remoteVideo)
    return $remoteVideo
}

function findRemoteVideoElement(id){
    return document.getElementById("remote_"+id)
}

function removeRemoteVideoElement(id){
    const $remoteVideo = findRemoteVideoElement(id)
    if($remoteVideo){
        $remoteVideo.pause()
        $remoteVideo.srcObject = null
        $remoteContainer.removeChild($remoteVideo)
    }else{
        console.log("Child element not found")
    }
}

function removeAllRemoteVideoElements(){
    while($remoteContainer.firstChild){
        const $child = $remoteContainer.firstChild
        $child.pause()
        $child.srcObject = null
        $remoteContainer.removeChild($child)
    }
}

//--------------- UI Buttons -------------------

function checkUseAudio(){
    return $useAudioCheck.checked
}

function checkUseVideo(){
    return $useVideoCheck.checked
}

function startMedia(){
    if(localStream){
        console.warn("WARN: Media stream has already started")
        return
    }

    const useAudio = checkUseAudio()
    const useVideo = checkUseVideo()

    let videoConstraints = false 
    if(useVideo){
        videoConstraints = {
            mandatory: {
                maxWidth: 177,
                maxHeight: 100
            }
        }
    }

    navigator.mediaDevices.getUserMedia({ audio: useAudio, video: videoConstraints })
        .then((stream)=>{
            localStream = stream
            playVideo($localVideo, localStream)
            updateButtons()
        })
        .catch((err)=>{
            console.error("Media Error", err)
        })
}

function stopMedia(){
    if(localStream){
        pauseVideo($localVideo)
        stoplocalStream(localStream)
        localStream = null
    }
    updateButtons()
}

async function connect(){
    if(!localStream){
        console.warn("WARN: local media not ready")
        return
    }

    await connectSocket().catch((err)=>{
        console.error(err)
        return
    })

    updateButtons()

    // Get Router RTP Capabilities from server
    const data = await sendRequest("getRouterRtpCapabilities", {})
    console.log("getRouterRtpCapabilities:", data)
    await loadDevice(data)

    // Get Producer Transport information from server
    const params = await sendRequest("createProducerTransport", {})
    console.log("Transport Params: ",params)
    producerTransport = device.createSendTransport(params)
    console.log("createSendTransport", producerTransport)

    // Join and Start publish
    producerTransport.on("connect", ({ dtlsParameters }, callback, errback)=>{
        console.log("Producer Transport Connect")
        sendRequest("connectProducerTransport", { dtlsParameters })
            .then(callback)
            .catch(errback)
    })

    producerTransport.on("produce", ({ kind, rtpParameters }, callback, errback)=>{
        console.log("Produce Transport")
        try{
            const { id } = sendRequest("produce", {
                transportId: producerTransport.id,
                kind,
                rtpParameters
            })
            callback({ id })
            subscribe()
        }catch(err){
            errback(err)
        }
    })

    producerTransport.on("connectionstatechange", (state)=>{
        switch(state){
            case "connecting":
                console.log("Publishing")
                break
            case "connected":
                console.log("Published")
                break
            case "failed":
                console.log("Failed")
                break
            default:
                break
        }
    })

    if(checkUseVideo()){
        const videoTrack = localStream.getVideoTracks()[0]
        if(videoTrack){
            videoProducer = await producerTransport.produce({ track: videoTrack, encodings: [{maxBitrate: 40000}]})
            console.log("******************************", videoProducer)
        }
    }

    if(checkUseAudio()){
        const audioTrack = localStream.getAudioTracks()[0]
        if(audioTrack){
            audioProducer = await producerTransport.produce({ track: audioTrack })
        }
    }

    updateButtons()
}

function disconnect(){
    if(localStream){
        pauseVideo($localVideo)
        stoplocalStream(localStream)
        localStream = null
    }
    if(videoProducer){
        videoProducer.close()
        videoProducer = null
    }
    if(audioProducer){
        audioProducer.close()
        audioProducer = null
    }
    if(producerTransport){
        producerTransport.close()
        producerTransport = null
    }
    
    for(const key in videoConsumers){
        videoConsumers[key].close()
        delete videoConsumers[key]
    }
    for(const key in audioConsumers){
        audioConsumers[key].close()
        delete audioConsumers[key]
    }

    if(consumerTransport){
        consumerTransport.close()
        consumerTransport = null
    }

    removeAllRemoteVideoElements()
    disconnectSocket()
    updateButtons()
}

async function loadDevice(routerRtpCapabilities){
    try{
        device = new MediasoupClient.Device()
    }catch(err){
        if (error.name === 'UnsupportedError') {
            console.error('browser not supported');
        }
    }
    await device.load({ routerRtpCapabilities })
}

async function subscribe(){
    if(!isSocketConnected()){
        await connectSocket().catch((err)=>{
            console.log(err)
            return
        })

        // Get Router RTP Capabilities
        const data = await sendRequest("getRouterRtpcapabilities", {})
        console.log("getRouterRtpcapabilities", data)
        await loadDevice(data)
    }

    // Prepare Transport
    if(!consumerTransport){
        const params = await sendRequest("createConsumerTransport", {})
        console.log("Transport params", params)
        consumerTransport = device.createRecvTransport(params)
        console.log("Created Consumer Transport")

        // Join and Start publish
        consumerTransport.on("connect", ({ dtlsParameters }, callback, errback)=>{
            console.log("Consumer Transport Connect")
            sendRequest("connectConsumerTransport", { dtlsParameters })
                .then(callback)
                .catch(errback)
        })

        consumerTransport.on('connectionstatechange', (state) => {
            switch (state) {
                case 'connecting':
                    console.log('subscribing...');
                    break;

                case 'connected':
                    console.log('subscribed');
                    break;

                case 'failed':
                    console.log('failed');
                    producerTransport.close();
                    break;

                default:
                    break;
            }
        });

        consumeCurrentProducers(clientId)
    }
}

async function consumeCurrentProducers(clientId){
    const remoteInfo = await sendRequest("getCurrentProducers", { localId: clientId })
        .catch((err) => {
            console.log(err)
            return
        })

    consumeAll(consumerTransport, remoteInfo.remoteVideoIds, remoteInfo.remoteAudioIds)
}

function consumeAll(transport, videoIds, audioIds){
    videoIds.forEach((id)=>{
        consumeAdd(transport, id, null, "video")
    })
    audioIds.forEach((id)=>{
        consumeAdd(transport, id, null, "audio")
    })
}

async function consumeAdd(transport, remoteSocketId, prodId, trackKind){
    const { rtpCapabilities } = device
    const data = await sendRequest("consumeAdd", {
        rtpCapabilities,
        remoteId: remoteSocketId,
        kind: trackKind
    }).catch((err) => {
        console.error(err)
    })

    const { producerId, id, kind, rtpParameters } = data
    if(prodId && (prodId != producerId)){
        console.warn("WARN: Producer ID did not match")
    }

    let codecOptions = {};
    const consumer = await transport.consume({
      id,
      producerId,
      kind,
      rtpParameters,
      codecOptions,
    });

    addRemoteTrack(remoteSocketId, consumer.track)
    addConsumer(remoteSocketId, consumer, kind)
    consumer.remoteId = remoteSocketId
    consumer.on("transportclose", () => {
        console.log('Consumer transport closed. remoteId=' + consumer.remoteId);
    });
    consumer.on("producerclose", () => {
        console.log('Consumer producer closed. remoteId=' + consumer.remoteId);
        consumer.close();
        removeConsumer(remoteId, kind);
        removeRemoteVideo(consumer.remoteId);
    });
    consumer.on('trackended', () => {
        console.log('Consumer trackended. remoteId=' + consumer.remoteId);
    });

    if (kind === 'video') {
        console.log('--try resumeAdd --');
        sendRequest('resumeAdd', { remoteId: remoteSocketId, kind: kind })
            .then(() => {
                console.log('resumeAdd OK');
            })
            .catch(err => {
                console.error('resumeAdd ERROR:', err);
            });
    }
}

function getConsumer(id, kind){
    if(kind === "video") return videoConsumers[id]
    else if(kind === "audio") return audioConsumers[id]
}

function addConsumer(id, consumer, kind){
    if(kind === "video") videoConsumers[id] = consumer
    else if(kind === "audio") audioConsumers[id] = consumer
}

function removeConsumer(id, kind){
    if(kind === "video") delete videoConsumers[id]
    else if(kind === "audio") delete audioConsumers[id]
}

// ------------------ UI Control --------------------
function disableElement(element){
    element.setAttribute("disabled", "1")
}

function enableElement(element){
    element.removeAttribute("disabled")
}

function updateButtons(){
    if(localStream){
        disableElement($useAudioCheck)
        disableElement($useVideoCheck)
        disableElement($startMediaButton)
        if(isSocketConnected()){
            disableElement($stopMediaButton)
            disableElement($connectButton)
            enableElement($disconnectButton)
        }else{
            enableElement($stopMediaButton)
            enableElement($connectButton)
            disableElement($disconnectButton)
        }
    }else{
        enableElement($useAudioCheck)
        enableElement($useVideoCheck)
        enableElement($startMediaButton)
        disableElement($stopMediaButton)
        disableElement($connectButton)
        disableElement($disconnectButton)
    }
}

updateButtons()