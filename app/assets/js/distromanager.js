const fs = require('fs-extra')
const path = require('path')
const { DistributionAPI } = require('hasta-core/common')
const { Type } = require('helios-distribution-types')

const ConfigManager = require('./configmanager')

// Old WesterosCraft url.
// exports.REMOTE_DISTRO_URL = 'https://zelthoriaismp.cloud/nebula/distribution.json'
exports.REMOTE_DISTRO_URL = 'https://ssmp.luninha.dev/distribution.json'

const api = new DistributionAPI(
    ConfigManager.getLauncherDirectory(),
    null, // Injected forcefully by the preloader.
    null, // Injected forcefully by the preloader.
    exports.REMOTE_DISTRO_URL,
    false
)

const LEGACY_COMMON_MODSTORE = 'modstore'

function getInstanceModStoreDirectory(serverId){
    return path.join(ConfigManager.getInstanceDirectory(), serverId, LEGACY_COMMON_MODSTORE)
}

function relocateModuleModStorePaths(modules, serverId){
    for(const module of modules){
        if(module.rawModule.type === Type.ForgeMod || module.rawModule.type === Type.LiteMod){
            const legacyRoot = path.join(ConfigManager.getCommonDirectory(), LEGACY_COMMON_MODSTORE)
            const relativePath = path.relative(legacyRoot, module.getPath())
            module.localPath = path.join(getInstanceModStoreDirectory(serverId), relativePath)
        }

        if(module.hasSubModules()){
            relocateModuleModStorePaths(module.subModules, serverId)
        }
    }
}

function useInstanceModStores(distribution){
    if(distribution == null){
        return distribution
    }

    for(const server of distribution.servers){
        relocateModuleModStorePaths(server.modules, server.rawServer.id)
    }

    return distribution
}

async function cleanLegacyCommonModStore(){
    const legacyRoot = path.join(ConfigManager.getCommonDirectory(), LEGACY_COMMON_MODSTORE)
    try {
        await fs.remove(legacyRoot)
    } catch {
        // Cleanup is best-effort. Launching should not fail if Windows keeps a file locked.
    }
}

const refreshDistributionOrFallback = api.refreshDistributionOrFallback.bind(api)
api.refreshDistributionOrFallback = async function(){
    const distribution = useInstanceModStores(await refreshDistributionOrFallback())
    cleanLegacyCommonModStore()
    return distribution
}

const getDistribution = api.getDistribution.bind(api)
api.getDistribution = async function(){
    return useInstanceModStores(await getDistribution())
}

const getDistributionLocalLoadOnly = api.getDistributionLocalLoadOnly.bind(api)
api.getDistributionLocalLoadOnly = async function(){
    return useInstanceModStores(await getDistributionLocalLoadOnly())
}

exports.getInstanceModStoreDirectory = getInstanceModStoreDirectory
exports.cleanLegacyCommonModStore = cleanLegacyCommonModStore
exports.DistroAPI = api