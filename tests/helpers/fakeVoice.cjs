function fakeVoice() {
  const originals = new Map(['navigator', 'RTCPeerConnection', 'Audio', 'MediaStream'].map(key => [key, Object.getOwnPropertyDescriptor(global, key)]));
  const tracks = [];
  const peers = [];
  class Stream { constructor(items) { this.items = items; } getTracks() { return this.items; } getAudioTracks() { return this.items; } }
  class Peer {
    constructor() { this.iceGatheringState = 'complete'; this.connectionState = 'new'; peers.push(this); }
    addTrack() {}
    createDataChannel() { return this.channel = { readyState: 'open', close() {}, send() {} }; }
    async createOffer() { return { type: 'offer', sdp: 'v=0\r\n' }; }
    async setLocalDescription(offer) { this.localDescription = offer; }
    async setRemoteDescription() { this.connectionState = 'connected'; this.onconnectionstatechange?.(); this.event({ type: 'session.started' }); }
    event(event) { this.channel.onmessage?.({ data: JSON.stringify(event) }); }
    close() { this.closed = true; this.connectionState = 'closed'; }
    addEventListener() {} removeEventListener() {}
  }
  const navigator = { mediaDevices: { getUserMedia: async () => {
    const track = { enabled: true, stopped: false, stop() { this.stopped = true; } }; tracks.push(track); return new Stream([track]);
  } } };
  for (const [key, value] of Object.entries({ navigator, RTCPeerConnection: Peer, MediaStream: Stream,
    Audio: class { async play() {} pause() {} } })) Object.defineProperty(global, key, { configurable: true, writable: true, value });
  return { tracks, peers, navigator, restore() { for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(global, key, descriptor); else delete global[key]; } } };
}
module.exports = { fakeVoice };
