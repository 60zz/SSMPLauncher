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

function getLegacyModStoreDirectory(){
    return path.join(ConfigManager.getCommonDirectory(), LEGACY_COMMON_MODSTORE)
}

function getLegacyModPath(instanceModPath, serverId){
    const relativePath = path.relative(getInstanceModStoreDirectory(serverId), instanceModPath)
    return path.join(getLegacyModStoreDirectory(), relativePath)
}

function getServerModStoreModules(distribution, serverId){
    const server = distribution?.getServerById(serverId)
    const modules = []

    function collect(mods){
        for(const module of mods){
            if(module.rawModule.type === Type.ForgeMod || module.rawModule.type === Type.LiteMod){
                modules.push(module)
            }

            if(module.hasSubModules()){
                collect(module.subModules)
            }
        }
    }

    if(server != null){
        collect(server.modules)
    }

    return modules
}

async function linkOrCopyFile(from, to){
    await fs.ensureDir(path.dirname(to))
    try {
        await fs.link(from, to)
    } catch {
        await fs.copy(from, to, { overwrite: true })
    }
}

async function prepareLegacyModStoreForValidation(distribution, serverId){
    for(const module of getServerModStoreModules(distribution, serverId)){
        const instancePath = module.getPath()
        const legacyPath = getLegacyModPath(instancePath, serverId)

        if(await fs.pathExists(instancePath) && !await fs.pathExists(legacyPath)){
            await linkOrCopyFile(instancePath, legacyPath)
        }
    }
}

async function materializeInstanceModStore(distribution, serverId){
    for(const module of getServerModStoreModules(distribution, serverId)){
        const instancePath = module.getPath()
        const legacyPath = getLegacyModPath(instancePath, serverId)

        if(await fs.pathExists(legacyPath)){
            if(!await fs.pathExists(instancePath)){
                await fs.ensureDir(path.dirname(instancePath))
                await fs.move(legacyPath, instancePath, { overwrite: true })
            } else {
                await fs.remove(legacyPath)
            }
        }
    }

    await cleanLegacyCommonModStore()
}

function isPathInside(parent, child){
    const relativePath = path.relative(parent, child)
    return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath))
}

function getModulePathRelativeToModStore(module, serverId){
    const modulePath = module.getPath()
    const instanceRoot = getInstanceModStoreDirectory(serverId)

    if(isPathInside(instanceRoot, modulePath)){
        return path.relative(instanceRoot, modulePath)
    }

    const legacyRoot = getLegacyModStoreDirectory()
    return path.relative(legacyRoot, modulePath)
}

function relocateModuleModStorePaths(modules, serverId){
    for(const module of modules){
        if(module.rawModule.type === Type.ForgeMod || module.rawModule.type === Type.LiteMod){
            const relativePath = getModulePathRelativeToModStore(module, serverId)
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
    return useInstanceModStores(await refreshDistributionOrFallback())
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
exports.prepareLegacyModStoreForValidation = prepareLegacyModStoreForValidation
exports.materializeInstanceModStore = materializeInstanceModStore
exports.cleanLegacyCommonModStore = cleanLegacyCommonModStore
exports.DistroAPI = api