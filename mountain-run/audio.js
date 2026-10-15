// Synthesized carb-fed 2.0-litre, eight-valve inline four. No audio downloads.
// The five-speed model drives the sound only; vehicle physics are unchanged.
(() => {
  'use strict';
  const idle = 1120, redline = 6900, shiftSpeeds = [390, 530, 690, 845, 1080];
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

  function powertrain() {
    let gear, rpm, previous, shiftUntil, lastShift, shift;
    function reset() { gear = 1; rpm = idle; previous = 0; shiftUntil = 0; lastShift = -1; shift = null; }
    reset();
    function step({ time, speed, running, gas, brake, launch }) {
      if (time < previous) reset();
      const dt = clamp(time - previous, 0, .1); previous = time; shift = null;
      if (running) {
        const wheelRpm = () => idle + Math.max(0, speed) / shiftSpeeds[gear - 1] * (redline - idle);
        if (!launch && time - lastShift > .36 && time >= shiftUntil) {
          if (!brake && gear < 5 && wheelRpm() > 6600) {
            gear++; shift = 'up'; shiftUntil = time + .18; lastShift = time;
          } else if (gear > 1 && wheelRpm() < 2700) {
            gear--; shift = 'down'; shiftUntil = time + .13; lastShift = time;
          }
        }
        const target = launch ? 5100 + Math.min(1, time / .55) * 1350 : clamp(wheelRpm(), idle, redline + 120);
        rpm += (target - rpm) * (1 - Math.exp(-dt * (time < shiftUntil ? 24 : 10)));
      }
      const shifting = time < shiftUntil, load = brake ? .03 : gas ? 1 : .22;
      return { gear, rpm, load, shifting, shift,
        // An ignition cut makes upshifts audible; a small blip marks downshifts.
        combustion: shifting ? .22 : rpm > redline ? .65 : 1 };
    }
    return { step, reset };
  }

  function create(context) {
    const drive = powertrain(), engineGain = context.createGain();
    engineGain.gain.value = 0;
    const output = context.createDynamicsCompressor();
    output.threshold.value = -12; output.knee.value = 12; output.ratio.value = 3;
    output.attack.value = .004; output.release.value = .12;
    engineGain.connect(output); output.connect(context.destination);

    // Four combustion pulses per 720-degree cycle, with slight cylinder variation.
    // Rich pulse harmonics replace the old single sawtooth oscillator.
    const real = new Float32Array(97), imag = new Float32Array(97), cylinders = [1, .94, .99, .91];
    for (let harmonic = 1; harmonic < real.length; harmonic++) {
      const envelope = Math.exp(-harmonic / 35) / Math.sqrt(harmonic);
      for (let cylinder = 0; cylinder < 4; cylinder++) {
        const phase = harmonic * cylinder * Math.PI / 2;
        real[harmonic] += Math.cos(phase) * cylinders[cylinder] * envelope;
        imag[harmonic] += Math.sin(phase) * cylinders[cylinder] * envelope;
      }
    }
    const exhaust = context.createOscillator();
    exhaust.frequency.value = idle / 120;
    exhaust.setPeriodicWave(context.createPeriodicWave(real, imag));
    const highpass = context.createBiquadFilter(); highpass.type = 'highpass'; highpass.frequency.value = 28;
    const saturation = context.createWaveShaper(), curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh((i * 2 / (curve.length - 1) - 1) * 2.4);
    saturation.curve = curve;
    const exhaustFilter = context.createBiquadFilter(); exhaustFilter.type = 'lowpass'; exhaustFilter.Q.value = .7; exhaustFilter.frequency.value = 1300;
    const exhaustGain = context.createGain(); exhaustGain.gain.value = .7;
    exhaust.connect(saturation); saturation.connect(highpass); highpass.connect(exhaustFilter);
    exhaustFilter.connect(exhaustGain); exhaustGain.connect(engineGain);

    const crank = context.createOscillator(), bassGain = context.createGain();
    crank.type = 'triangle'; crank.frequency.value = idle / 60; bassGain.gain.value = .16; crank.connect(bassGain); bassGain.connect(engineGain);

    const noise = context.createBufferSource(), buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    noise.buffer = buffer; noise.loop = true;
    // The carburettor's intake bark opens with the gas pedal, independently of pitch.
    const intake = context.createBiquadFilter(); intake.type = 'bandpass'; intake.Q.value = 1.1; intake.frequency.value = 800;
    const intakeGain = context.createGain(); intakeGain.gain.value = 0;
    noise.connect(intake); intake.connect(intakeGain); intakeGain.connect(engineGain);

    const shiftFilter = context.createBiquadFilter(); shiftFilter.type = 'lowpass'; shiftFilter.frequency.value = 330;
    const shiftGain = context.createGain(); shiftGain.gain.value = 0;
    noise.connect(shiftFilter); shiftFilter.connect(shiftGain); shiftGain.connect(engineGain);

    // Keep tire squeal separate, so burnout and pothole skids retain their sound.
    const tireOsc = context.createOscillator(); tireOsc.type = 'triangle'; tireOsc.frequency.value = 740;
    const tireFilter = context.createBiquadFilter(); tireFilter.type = 'bandpass'; tireFilter.frequency.value = 1450; tireFilter.Q.value = .9;
    const tireGain = context.createGain(); tireGain.gain.value = 0;
    noise.connect(tireFilter); tireOsc.connect(tireFilter); tireFilter.connect(tireGain); tireGain.connect(output);
    exhaust.start(); crank.start(); noise.start(); tireOsc.start();

    function update(input) {
      const state = drive.step(input), now = context.currentTime;
      const flutter = (Math.sin(input.time * 19) * 22 + Math.sin(input.time * 31) * 13) * (1 - state.load * .6);
      const rpm = state.rpm + flutter;
      exhaust.frequency.setTargetAtTime(rpm / 120, now, .025);
      crank.frequency.setTargetAtTime(rpm / 60, now, .025);
      exhaustFilter.frequency.setTargetAtTime(700 + rpm * .24 + state.load * 1500, now, .04);
      exhaustGain.gain.setTargetAtTime((.55 + state.load * .25) * state.combustion, now, .018);
      intake.frequency.setTargetAtTime(450 + rpm * .19, now, .035);
      intakeGain.gain.setTargetAtTime((.015 + state.load * .19) * state.combustion, now, .025);
      if (state.shift && input.audible) {
        shiftGain.gain.cancelScheduledValues(now);
        shiftGain.gain.setValueAtTime(state.shift === 'up' ? .2 : .12, now);
        shiftGain.gain.exponentialRampToValueAtTime(.0001, now + .085);
      }
      const audible = input.audible && input.running;
      engineGain.gain.setTargetAtTime(audible ? .105 + state.load * .1 : 0, now, .035);
      tireOsc.frequency.setTargetAtTime(740 + input.speed * .4 + Math.sin(input.time * 31) * 45, now, .03);
      tireGain.gain.setTargetAtTime(audible ? .035 * input.tireLevel : 0, now, .035);
      return state;
    }
    function reset() {
      drive.reset(); shiftGain.gain.cancelScheduledValues(context.currentTime);
      shiftGain.gain.setValueAtTime(0, context.currentTime);
    }
    return { update, reset, context, engineGain, tireGain };
  }
  globalThis.MountainAudio = Object.freeze({ create, powertrain });
})();
