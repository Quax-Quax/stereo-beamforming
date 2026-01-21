class BeamformingProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.micDistance = 0.2;
    this.sampleRate = sampleRate;
    this.currentMethod = 'passthrough';
    this.midSideStrength = 0.7;
    this.paracardioidStrength = 0.8;
    this.tdoaDelay = 0;
    this.frequencyBands = 4;
    this.prevLeftSample = 0;
    this.prevRightSample = 0;
    
    this.port.onmessage = (event) => {
      const { command, value } = event.data;
      if (command === 'setMethod') {
        this.currentMethod = value;
      } else if (command === 'setMicDistance') {
        this.micDistance = value;
        this.updateTDOADelay();
      } else if (command === 'setMidSideStrength') {
        this.midSideStrength = value;
      } else if (command === 'setParacardioidStrength') {
        this.paracardioidStrength = value;
      }
    };
    this.updateTDOADelay();
  }
  
  updateTDOADelay() {
    const speedOfSound = 343;
    const delayTime = this.micDistance / speedOfSound;
    this.tdoaDelay = Math.round(delayTime * this.sampleRate);
  }
  
  processMidSide(left, right) {
    const mid = (left + right) / 2;
    const side = (left - right) / 2;
    const reducedSide = side * (1 - this.midSideStrength);
    const outLeft = (mid + reducedSide);
    const outRight = (mid - reducedSide);
    return [outLeft, outRight];
  }
  
  processParacardioid(left, right) {
    const omni = (left + right) / 2;
    const figure8 = (left - right) / 2;
    const cardioid = omni + figure8 * this.paracardioidStrength;
    return [cardioid, cardioid];
  }
  
  processTDOA(left, right) {
    let delayedRight;
    if (this.tdoaDelay > 0) {
      delayedRight = this.prevRightSample;
    } else {
      delayedRight = right;
    }
    const output = (left + delayedRight) / 2;
    this.prevLeftSample = left;
    this.prevRightSample = right;
    return [output, output];
  }
  
  processFrequencyDependent(left, right) {
    const midSideOut = this.processMidSide(left, right);
    const paraOut = this.processParacardioid(left, right);
    const weight = 0.4;
    const outLeft = midSideOut[0] * (1 - weight) + paraOut[0] * weight;
    const outRight = midSideOut[1] * (1 - weight) + paraOut[1] * weight;
    return [outLeft, outRight];
  }
  
  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    
    // ステレオ入力チャンネル取得
    const leftChannel = input[0];
    const rightChannel = input.length > 1 ? input[1] : input[0];
    
    // ステレオ出力チャンネル
    const outLeftChannel = output[0];
    const outRightChannel = output.length > 1 ? output[1] : output[0];
    
    if (!leftChannel || !rightChannel || !outLeftChannel) {
      return true;
    }
    
    for (let i = 0; i < leftChannel.length; i++) {
      let processed;
      switch (this.currentMethod) {
        case 'midside':
          processed = this.processMidSide(leftChannel[i], rightChannel[i]);
          break;
        case 'paracardioid':
          processed = this.processParacardioid(leftChannel[i], rightChannel[i]);
          break;
        case 'tdoa':
          processed = this.processTDOA(leftChannel[i], rightChannel[i]);
          break;
        case 'frequency':
          processed = this.processFrequencyDependent(leftChannel[i], rightChannel[i]);
          break;
        case 'passthrough':
        default:
          processed = [(leftChannel[i] + rightChannel[i]) / 2, 0];
          break;
      }
      // ステレオ出力を各チャンネルに割り当て
      outLeftChannel[i] = Math.max(-1, Math.min(1, processed[0]));
      outRightChannel[i] = Math.max(-1, Math.min(1, processed[1]));
    }
    return true;
  }
}
registerProcessor('beamforming-processor', BeamformingProcessor);
