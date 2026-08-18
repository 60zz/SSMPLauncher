/* global document */
const {ipcRenderer}  = require('electron')
const fs             = require('fs-extra')
const os             = require('os')
const path           = require('path')
const launcherDir    = path.join(require('@electron/remote').app.getPath('userData'), 'config.json')

const ConfigManager  = require('./configmanager')
const { DistroAPI }  = require('./distromanager')
const LangLoader     = require('./langloader')
const { LoggerUtil } = require('hasta-core')
// eslint-disable-next-line no-unused-vars
const { HeliosDistribution } = require('hasta-core/common')

const logger = LoggerUtil.getLogger('Preloader')

logger.info('Loading..')

// Load ConfigManager
ConfigManager.load()

// Yuck!
// TODO Fix this
DistroAPI['commonDir'] = ConfigManager.getCommonDirectory()
DistroAPI['instanceDir'] = ConfigManager.getInstanceDirectory()

// Load Strings
LangLoader.setupLanguage(launcherDir)

/**
 * 
 * @param {HeliosDistribution} data 
 */
function sendDistributionIndexDone(success){
    const send = () => ipcRenderer.send('distributionIndexDone', success)

    if(document.readyState === 'loading'){
        document.addEventListener('readystatechange', () => {
            if(document.readyState === 'interactive' || document.readyState === 'complete'){
                send()
            }
        }, { once: true })
    } else {
        send()
    }
}
function onDistroLoad(data){
    if(data != null){
        
        // Resolve the selected server if its value has yet to be set.
        if(ConfigManager.getSelectedServer() == null || data.getServerById(ConfigManager.getSelectedServer()) == null){
            logger.info('Determining default selected server..')
            ConfigManager.setSelectedServer(data.getMainServer().rawServer.id)
            ConfigManager.save()
        }
    }
    sendDistributionIndexDone(data != null)
}

// Ensure Distribution is downloaded and cached.
function refreshDistributionInBackground(){
    DistroAPI.refreshDistributionOrFallback()
        .then(heliosDistro => {
            if(heliosDistro != null){
                logger.info('Distribution index refreshed in background.')
                ipcRenderer.send('distributionIndexRefreshed')
            }
        })
        .catch(err => {
            logger.warn('Failed to refresh the distribution index in background.', err)
        })
}

// Load the cached distribution first so the UI is not blocked by a slow network request.
DistroAPI.getDistributionLocalLoadOnly()
    .then(heliosDistro => {
        logger.info('Loaded cached distribution index.')
        refreshDistributionInBackground()
    })
    .catch(localErr => {
        logger.warn('Failed to load cached distribution index, falling back to remote load.', localErr)
        DistroAPI.refreshDistributionOrFallback()
            .then(heliosDistro => {
                logger.info('Loaded distribution index from remote or fallback.')
                onDistroLoad(heliosDistro)
            })
            .catch(err => {
                logger.info('Failed to load an older version of the distribution index.')
                logger.info('Application cannot run.')
                logger.error(err)

                onDistroLoad(null)
            })
    })

// Clean up temp dir incase previous launches ended unexpectedly. 
fs.remove(path.join(os.tmpdir(), ConfigManager.getTempNativeFolder()), (err) => {
    if(err){
        logger.warn('Error while cleaning natives directory', err)
    } else {
        logger.info('Cleaned natives directory.')
    }
})