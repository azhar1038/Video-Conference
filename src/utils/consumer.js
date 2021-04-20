let consumerTransports = {}
let videoConsumers = {}
let audioConsumers = {}

function addConsumerTransport(id, transport){
    consumerTransports[id] = transport
    console.log("------ Added Consumer Transport", id)
}

function getConsumerTransport(localId){
    return consumerTransports[localId]
}

function removeConsumerTransport(localId){
    delete consumerTransports[localId]
    console.log("------ Removed Consumer Transport")
}

function addConsumerSet(localId, set, kind) {
    if (kind === 'video') videoConsumers[localId] = set;
    else if (kind === 'audio') audioConsumers[localId] = set;
}

function getConsumerSet(localId, kind){
    if(kind === "video") return videoConsumers[localId]
    else if(kind === 'audio') return audioConsumers[localId]
}

function removeConsumerSet(localId){
    const videoSet = getConsumerSet(localId, "video")
    delete videoConsumers[localId]
    if(videoSet){
        for(const key in videoSet){
            const consumer = videoSet[key]
            consumer.close()
            delete videoSet[key]
        }
        console.log("------ Removed video consumers set")
    }

    const audioSet = getConsumerSet(localId, "audio")
    delete audioConsumers[localId]
    if(audioSet){
        for(const key in audioSet){
            const consumer = audioSet[key]
            consumer.close()
            delete audioSet[key]
        }
        console.log("------ Removed audio consumers set")
    }
}

function addConsumer(localId, remoteId, consumer, kind){
    const consumers = getConsumerSet(localId, kind)
    if(consumers){
        consumers[remoteId] = consumer
        console.log("------ Added Consumer")
    }else {
        console.log('new set for kind=%s, localId=%s', kind, localId);
        const newSet = {};
        newSet[remoteId] = consumer;
        addConsumerSet(localId, newSet, kind);
        console.log('consumers kind=%s count=%d', kind, Object.keys(newSet).length);
      }
}

async function createConsumer(router, transport, producer, rtpCapabilities){
    let consumer = null
    const canConsume = router.canConsume({
        producerId: producer.id,
        rtpCapabilities
    })

    if(!canConsume){
        console.log("Cannot consume")
        return
    }

    consumer = await transport.consume({
        producerId: producer.id,
        rtpCapabilities,
        paused: producer.kind === 'video',
    }).catch(err => {
        console.error('consume failed', err);
        return;
    });

    return {
        consumer: consumer,
        params: {
            producerId: producer.id,
            id: consumer.id,
            kind: consumer.kind,
            rtpParameters: consumer.rtpParameters,
            type: consumer.type,
            producerPaused: consumer.producerPaused
        }
    };
}

function getConsumer(localId, remoteId, kind){
    const consumers = getConsumerSet(localId, kind)
    if(consumers) return consumers[remoteId]
    else return null
}

function removeConsumer(localId, remoteId, kind){
    const set = getConsumerSet(localId, kind)
    if(set){
        delete set[remoteId]
        console.log("Removed consumer")
    }
}

module.exports = {
    addConsumerTransport,
    getConsumerTransport,
    removeConsumerTransport,
    addConsumerSet,
    getConsumerSet,
    removeConsumerSet,
    addConsumer,
    createConsumer,
    getConsumer,
    removeConsumer
}