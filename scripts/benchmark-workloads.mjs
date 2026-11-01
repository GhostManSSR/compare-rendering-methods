export const networkProfiles = {
    'fast-4g': {
        rttMs: 20,
        throughputKbps: 10240,
        requestLatencyMs: 20,
        downloadThroughputKbps: 10240,
        uploadThroughputKbps: 5120,
        cpuSlowdownMultiplier: 2,
    },
    'regular-4g': {
        rttMs: 40,
        throughputKbps: 4096,
        requestLatencyMs: 40,
        downloadThroughputKbps: 4096,
        uploadThroughputKbps: 2048,
        cpuSlowdownMultiplier: 2,
    },
    'slow-3g': {
        rttMs: 150,
        throughputKbps: 1600,
        requestLatencyMs: 150,
        downloadThroughputKbps: 1600,
        uploadThroughputKbps: 750,
        cpuSlowdownMultiplier: 2,
    },
}

export const workloadProfiles = {
    light: {
        extraCards: 0,
        imageCount: 0,
        imageBytes: 0,
        imageWidth: 320,
        jsBytes: 0,
    },
    medium: {
        extraCards: 24,
        imageCount: 6,
        imageBytes: 16_000,
        imageWidth: 480,
        jsBytes: 24_000,
    },
    heavy: {
        extraCards: 60,
        imageCount: 24,
        imageBytes: 64_000,
        imageWidth: 960,
        jsBytes: 96_000,
    },
}

const metadataCache = new Map()

function pseudoRandomText(length, seed) {
    let state = seed >>> 0
    let result = ''
    const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'

    for (let index = 0; index < length; index++) {
        state ^= state << 13
        state ^= state >>> 17
        state ^= state << 5
        result += alphabet[(state >>> 0) % alphabet.length]
    }

    return result
}

export function createWorkloadScript(name) {
    const profile = workloadProfiles[name]

    if (!Object.hasOwn(workloadProfiles, name) || name === 'light') {
        return null
    }

    const source = `(()=>{const profile=${JSON.stringify(name)};const cards=${profile.extraCards};const images=${profile.imageCount};const width=${profile.imageWidth};let attempts=0;const mount=()=>{const catalog=document.querySelector('.catalog');if(!catalog&&attempts++<100){setTimeout(mount,50);return}const section=document.createElement('section');section.setAttribute('aria-label','Synthetic benchmark workload');section.style.cssText='display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;margin:24px 0';for(let index=0;index<cards;index++){const card=document.createElement('article');const title=document.createElement('h2');title.textContent='Synthetic product '+(index+1);const description=document.createElement('p');description.textContent='Controlled DOM and image workload for repeatable rendering measurements.';card.append(title,description);if(index<images){const image=document.createElement('img');image.src='/benchmark-assets/image.svg?workload='+profile+'&index='+index;image.width=width;image.height=Math.round(width*0.75);image.alt='Synthetic workload image '+(index+1);image.loading='eager';image.style.cssText='display:block;width:100%;height:auto';card.prepend(image)}section.append(card)}if(catalog)catalog.before(section);else document.querySelector('.intro')?.after(section)};mount()})();\n`
    const paddingLength = Math.max(0, profile.jsBytes - source.length - 5)

    return `/*${pseudoRandomText(paddingLength, name.length * 7919)}*/\n${source}`
}

export function createBenchmarkImage(name, index) {
    const profile = workloadProfiles[name]

    if (
        !Object.hasOwn(workloadProfiles, name) ||
        index < 0 ||
        index >= profile.imageCount ||
        !Number.isInteger(index)
    ) {
        return null
    }

    const start = `<svg xmlns="http://www.w3.org/2000/svg" width="${profile.imageWidth}" height="${Math.round(profile.imageWidth * 0.75)}" viewBox="0 0 4 3"><rect width="4" height="3" fill="#e36a42"/><text x="0.2" y="1.6" fill="white" font-size=".35">Benchmark image ${index + 1}</text><!--`
    const end = '--></svg>'
    const paddingLength = Math.max(
        0,
        profile.imageBytes - start.length - end.length
    )

    return `${start}${pseudoRandomText(paddingLength, (index + 1) * 104729)}${end}`
}

export function workloadMetadata(name) {
    const cached = metadataCache.get(name)
    if (cached) {
        return cached
    }

    if (!Object.hasOwn(workloadProfiles, name)) {
        throw new Error(`Unknown workload profile: ${name}`)
    }
    const profile = workloadProfiles[name]

    const script = createWorkloadScript(name)
    const image = profile.imageCount
        ? createBenchmarkImage(name, 0)
        : null

    const metadata = {
        workload: name,
        catalogItems: 12,
        syntheticJsBytes: script?.length ?? 0,
        syntheticImageCount: profile.imageCount,
        syntheticImageBytes: image?.length ?? 0,
        syntheticImagesTotalBytes: (image?.length ?? 0) * profile.imageCount,
        syntheticDomNodes:
            profile.extraCards * 3 + profile.imageCount + (profile.extraCards ? 1 : 0),
        extraDomCards: profile.extraCards,
        imageWidth: profile.imageWidth,
    }
    metadataCache.set(name, metadata)
    return metadata
}
