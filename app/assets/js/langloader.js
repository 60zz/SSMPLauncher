/* eslint-disable no-undef */
const fs = require('fs-extra')
const isDev = require('./isdev')
const path = require('path')
const toml = require('toml')
const merge = require('lodash.merge')

const defaultLang = 'pt_BR'
let config = null
let lang

function getLanguageDirectory() {
    return isDev ? path.join(process.cwd(), 'lang') : path.join(process.resourcesPath, 'lang')
}

/**
 * Languages are now a resource
 * this detects the environment of the launcher (if it's dev, if it's a MacOS release or a Windows/Ubuntu release) and applies the directory in any case
 * this aims to fix the releases because before it only worked in the dev environment, it works on Windows but still needs testing on MacOS and Ubuntu
 * 
 * sorry for this shtty code LMAO
 */

exports.loadLanguage = function(id){
    const langPath = path.join(getLanguageDirectory(), `${id}.toml`)
    lang = merge(lang || {}, toml.parse(fs.readFileSync(langPath, 'UTF-8')) || {})
}

exports.query = function(id, placeHolders){
    const query = id.split('.')
    let res = lang
    for(const q of query){
        if(res == null || typeof res !== 'object' || !Object.prototype.hasOwnProperty.call(res, q)){
            return ''
        }
        res = res[q]
    }
    let text = typeof res === 'string' ? res : ''
    if (placeHolders && text) {
        Object.entries(placeHolders).forEach(([key, value]) => {
            text = text.replaceAll(`{${key}}`, value)
        })
    }
    return text
}

exports.queryJS = function(id, placeHolders){
    return exports.query(`js.${id}`, placeHolders)
}

exports.queryEJS = function(id, placeHolders){
    return exports.query(`ejs.${id}`, placeHolders)
}

function getLang(dir) {
    if(!dir){
        return defaultLang
    }

    try{
        config = JSON.parse(fs.readFileSync(dir, 'UTF-8'))
        return config?.settings?.launcher?.language || defaultLang
    } catch (err){
        return defaultLang
    }
}

exports.setupLanguage = function(dir){
    // Load Language Files and check for conflict with CM
    const selectedLang = getLang(dir)
    if(selectedLang) {
        exports.loadLanguage(selectedLang)
        // Load Custom Language File for Launcher Customizer
        exports.loadLanguage('_custom')
    }
}