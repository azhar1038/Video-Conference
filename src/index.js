const fs = require("fs")
const http = require("http")
const https = require("https")
const path = require("path")
const express = require("express")
const mediasoup = require("mediasoup")
const socketio = require("socket.io")
const mediasoupConfig = require("../mediasoup-config")
const {
    addConsumerTransport,
    getConsumerTransport,
    removeConsumerTransport,
    removeConsumerSet,
    addConsumer,
    createConsumer,
    getConsumer,
    removeConsumer
} = require("./utils/consumer")
const {
    addProducerTransport,
    getProducerTransport,
    removeProducerTransport,
    addProducer,
    getProducer,
    removeProducer,
    getRemoteIds
} = require("./utils/producer")

   
const app = express()
let server = null
if(mediasoupConfig.useHttps){
    if(fileExists(mediasoupConfig.tls.cert) && fileExists(mediasoupConfig.tls.key)){
        const sslOptions = {
            cert: fs.readFileSync(mediasoupConfig.tls.cert).toString(),
            key: fs.readFileSync(mediasoupConfig.tls.key).toString()
        }
        server = https.createServer(sslOptions, app)
    }else{
        console.error("Failed to create Server. Certificates not found!")
    }
}else{
    server = http.createServer(app)
}

function fileExists(path){
    try{
        if(fs.existsSync(path)) return true
    }catch(err){
        console.error(err)
        return false
    }
}

const publicDirectoryPath = path.join(__dirname, "../public")

app.use(express.static(publicDirectoryPath))

// app.get("", (req, res)=>{
//     res.send("Mediasoup")
// })

server.listen(mediasoupConfig.listenPort, ()=>{
    console.log(`Server is up and running at port: ${mediasoupConfig.listenPort}`)
    console.log(__dirname)
})

// Mediasoup data declaration
let worker
let router

async function startWorker(){
    const mediaCodecs = mediasoupConfig.mediasoup.routerOptions.mediaCodecs
    worker = await mediasoup.createWorker(mediasoupConfig.mediasoup.workerSettings)
    router = await worker.createRouter({ mediaCodecs })
    console.log('Mediasoup worker start.')
}

startWorker()

// Socket.io code
const io = socketio(server)
console.log(`Socket IO server started at port: ${mediasoupConfig.listenPort}`)

io.on("connection", (socket)=>{
    console.log("A new connection: "+ socket.id)

    socket.on("disconnect", ()=>{
        console.log("User left: "+socket.id)
        cleanUpPeer(socket.id)
    })

    socket.on("error", (err)=>{
        console.error("Error with socket: ", err)
        //TODO: Do something on error
    })

    socket.on("connect_error", (err)=>{
        console.error("Client connect error: ", err)
        //TODO: Do something on client connection error
    })

    socket.on("getRouterRtpCapabilities", (data, callback)=>{
        if(router){
            // rtpCapabilities is used by mediasoup client to compute 
            // their sending RTP parameters
            const capabilities = router.rtpCapabilities
            sendResponse(capabilities, callback)
        }else{
            const error = { error: "Router not ready" }
            sendReject(error, callback)
        }
    })

    // ---------------------- Producer sockets --------------------------------

    socket.on("createProducerTransport", async (data, callback)=>{
        console.log("--- Create Producer Transport")
        const { transport, params } = await createTransport()
        addProducerTransport(socket.id, transport)
        transport.observer.on("close", ()=>{
            const id = socket.id
            const videoProducer = getProducer(id, "video")
            if(videoProducer){
                videoProducer.close()
                removeProducer(id, "video")
            }

            const audioProducer = getProducer(id, "audio")
            if(audioProducer){
                audioProducer.close()
                removeProducer(id, "audio")
            }

            removeProducerTransport(id)
        })

        sendResponse(params, callback)
    })

    socket.on("connectProducerTransport", async (data, callback)=>{
        console.log("--- Connect Producer Transport")
        const transport = getProducerTransport(socket.id)
        if(transport){
            await transport.connect({ dtlsParameters: data.dtlsParameters })
            sendResponse({}, callback)
        }else{
            console.error("Transport not found to connect")
        }
    })

    socket.on("produce", async (data, callback)=>{
        const { kind, rtpParameters } = data
        console.log(`--- Producing ${kind}`)
        const id = socket.id
        const transport = getProducerTransport(id)
        if(!transport){
            console.error("Transport not found for id: "+id)
            return
        }
        const producer = await transport.produce({ kind, rtpParameters })
        console.log(`------ Got ${kind} producer`)
        addProducer(id, producer, kind)
        producer.observer.on("close", ()=>{
            console.log(`Producer of type "${kind}" closed`)
            //TODO: Do something on producer close
        })
        sendResponse({ id: producer.id }, callback)

        // Inform all clients about new producers
        socket.broadcast.emit('newProducer', {
            socketId: socket.id,
            producerId: producer.id,
            kind: producer.kind
        })
    })

    // ------------------------ Consumer Sockets ------------------------------

    socket.on("createConsumerTransport", async (data, callback)=>{
        console.log("--- Create Consumer Transport ----------------------------", socket.id)
        const { transport, params} = await createTransport();
        addConsumerTransport(socket.id, transport)
        transport.observer.on("close", ()=>{
            const id = socket.id
            removeConsumerSet(id)
            removeConsumerTransport(id)
        })
        sendResponse(params, callback)
    })

    socket.on("connectConsumerTransport", async (data, callback)=>{
        console.log("--- Connect Consumer Transport ---------------------------")
        const transport = getConsumerTransport(socket.id)
        if(!transport){
            console.error("Transport does not exists")
            return
        }

        await transport.connect({ dtlsParameters: data.dtlsParameters })
        sendResponse({}, callback)
    })

    socket.on("consume", async (data, callback)=>{
        //TODO: Implement consume
        console.error("Consume not yet implement")
    })

    socket.on("resume", async (data, callback)=>{
        //TODO: Implement resume
        console.error("Resume not yet implement")
    })

    // ------------------------ Extra Socket ----------------------------------
    socket.on("getCurrentProducers", async (data, callback)=>{
        const localId = data.localId

        const remoteVideoIds = getRemoteIds(localId, "video")
        const remoteAudioIds = getRemoteIds(localId, "audio")
        console.log("*****************************************")
        console.log("AudioIds", remoteAudioIds)
        console.log("VideoIds", remoteVideoIds)
        console.log("*****************************************")
        sendResponse({ remoteVideoIds, remoteAudioIds }, callback)
    })

    socket.on("consumeAdd", async (data, callback)=>{
        const localId = socket.id
        const kind = data.kind
        const transport = getConsumerTransport(localId)
        if(!transport){
            console.log("Transport does not exists")
            return
        }

        const rtpCapabilities = data.rtpCapabilities
        const remoteId = data.remoteId

        const producer = getProducer(remoteId, kind)
        if(!producer){
            console.log("Producer does not exists")
            return
        }

        const { consumer, params } = await createConsumer(router, transport, producer, rtpCapabilities)
        addConsumer(localId, remoteId, consumer, kind)
        consumer.observer.on("close", ()=>{
            console.log("Consumer closed")
        })

        consumer.on("producerClose", ()=>{
            console.log("consumer ----- on producerClose")
            consumer.close()
            removeConsumer(localId, remoteId, kind)

            socket.emit("producerClosed", { localId, remoteId, kind })
        })

        console.log("------ Consumer Ready")
        sendResponse(params, callback)
    })

    socket.on('resumeAdd', async (data, callback) => {
        const localId = socket.id;
        const remoteId = data.remoteId;
        const kind = data.kind;
        console.log('-- resumeAdd localId=%s remoteId=%s kind=%s', localId, remoteId, kind);
        let consumer = getConsumer(localId, remoteId, kind);
        if (!consumer) {
          console.error('consumer does exists not for remoteId=' + remoteId);
          return;
        }
        await consumer.resume();
        sendResponse({}, callback)
    });

    sendBack(socket, { type: "welcome", id: socket.id})

    function sendResponse(response, callback){
        callback(null, response)
    }

    function sendReject(error, callback){
        callback(error.toString(), null)
    }

    function sendBack(socket, message){
        socket.emit("message", message)
    }
})

async function createTransport(){
    // transport connects an endpoint with a mediasoup router and enables transmission
    // of media in both directions by means of [Producer], [Consumer], [DataProducer]
    // and [DataConsumer] instances created on it
    const transport = await router.createWebRtcTransport(mediasoupConfig.mediasoup.webRtcTransportOptions)
    console.log("------ Created Transport: "+transport.id)
    return {
        transport,
        params: {
            // Transporter Identifier
            id: transport.id,

            // Local ICE parameters
            iceParameters: transport.iceParameters,

            // Array of Local ICE candidates
            iceCandidates: transport.iceCandidates,

            // Local DTLS parameters
            dtlsParameters: transport.dtlsParameters
        }
    }
}

function cleanUpPeer(id){
    removeConsumerSet(id)
    const transport = getConsumerTransport(id)
    if(transport){
        transport.close()
        removeConsumerTransport(id)
    }

    const videoProducer = getProducer(id, "video")
    if(videoProducer){
        videoProducer.close()
        removeProducer(id, "video")
    }

    const audioProducer = getProducer(id, "audio")
    if(audioProducer){
        audioProducer.close()
        removeProducer(id, "audio")
    }

    const producerTransport = getProducerTransport(id)
    if(producerTransport){
        producerTransport.close()
        removeProducerTransport(id)
    }
}