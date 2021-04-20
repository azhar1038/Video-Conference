let producerTransports = {}
let videoProducers = {}
let audioProducers = {}

function addProducerTransport(id, transport){
    producerTransports[id] = transport
    console.log("------Added producer transport")
}

function getProducerTransport(id){
    return producerTransports[id]
}

function removeProducerTransport(id){
    delete producerTransports[id]
    console.log("Removed Producer Transport")
}

function addProducer(id, producer, kind){
    if(kind === "video") videoProducers[id] = producer
    else if(kind === "audio") audioProducers[id] = producer
    console.log(`------ Producer of type "${kind}" Added`)
}

function getProducer(id, kind){
    if(kind === "video") return videoProducers[id]
    else if(kind === "audio") return audioProducers[id]
}

function removeProducer(id, kind){
    if(kind === "video"){
        delete videoProducers[id]
        console.log("Deleted Video Producer")
    }else if(kind === "audio"){
        delete audioProducers[id]
        console.log("Deleted Audio Producer")
    }
}

function getRemoteIds(localId, kind){
    const remoteIds = []
    if(kind === "video"){
        for(const key in videoProducers){
            if(key != localId) remoteIds.push(key)
        }
    }else if(kind === "audio"){
        for(const key in audioProducers){
            if(key != localId) remoteIds.push(key)
        }
    }
    return remoteIds
}

module.exports = {
    addProducerTransport,
    getProducerTransport,
    removeProducerTransport,
    addProducer,
    getProducer,
    removeProducer,
    getRemoteIds
}
