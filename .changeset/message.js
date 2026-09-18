export default {
  async getVersionMessage(releasePlan, _options) {
    const released = releasePlan.releases.filter((release) => release.type !== 'none')

    if (released.length === 0) {
      throw new Error(`no packages to release`)
    }

    const lines = released.map((release) => `- ${release.name}@${release.newVersion}`)

    return `chore: release packages\n\n${lines.join('\n')}`
  },
}
