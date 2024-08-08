<template>
  <div>
    <video id="video" width="1920" height="1080" controls ref="videoEle" muted="muted"></video>
    <!-- <button @click="load"></button> -->
  </div>
  <canvas id='canvas'> </canvas>
  <canvas id="canvas1"></canvas>
  <!-- <img src="/TEST.webp" id="testjpg"> -->
  <button @click="play" :disabled="!session">Play</button>
  <button @click="mute">mute</button>
  <button @click="pause">pause</button>
  <!-- {{ output }} -->
  {{ out_process }}

</template>

<script lang="ts" setup>
// import {Vue} from 'vue'
// import VueWorker from 'vue-worker'
// Vue.use(VueWorker)




import mpegts from 'mpegts.js'
import { Tensor } from 'onnxruntime-web';
import * as ort from 'onnxruntime-web/webgpu';
import { decode } from './utils/centerface_utils';

ort.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/";
ort.env.webgpu.powerPreference = 'high-performance'

const output = ref({ dets: [], lmss: [] })
const out_process = computed(
  () => (output.value['dets'].length)
)

var fps = 0
let controller1
let dets1
let float32array
let bitmap1: ImageBitmap
let timestamp1

const videoEle = ref<HTMLVideoElement>()
const videoContainer = document.createElement('video',)
const flvPlayer = ref()
const session = ref<ort.InferenceSession>()
const initFlv = () => {

  if (videoContainer != null && mpegts.isSupported()) {
    flvPlayer.value = mpegts.createPlayer({
      type: 'flv',
      isLive: true,
      hasAudio: true,
      // url: "http://192.168.88.105:8081/live/test.flv?token=test"
      url: "test2.flv"

    })

    flvPlayer.value.attachMediaElement(videoContainer)


    flvPlayer.value.load()
    // videoContainer.muted = true; // 静音



  }
}

const play = () => {
  flvPlayer.value.play()

}

const pause = () => {
  flvPlayer.value.pause()

}

const mute = () => {
  videoContainer.muted = !videoContainer.muted
}

let currentStream;
let currentProcessedStream;

const stopMediaTracks = stream => {
  stream.getTracks().forEach(track => {
    track.stop();
  });
};

videoContainer.addEventListener('playing', () => {
  // stopMediaTracks(currentProcessedStream);
  // stopMediaTracks(currentStream);

  console.log('play')
  const stream = videoContainer.captureStream();
  const videoTrack = stream.getVideoTracks()[0];
  // const audioTrack = stream.getAudioTracks()[0]
  window.stream = stream
  currentStream = stream

  const trackProcessor = new MediaStreamTrackProcessor({ track: videoTrack })
  const trackGenerator = new MediaStreamTrackGenerator({ kind: "video" });
  trackProcessor.readable
    .pipeThrough(transformer)
    //.pipeThrough(transformerB)
    .pipeTo(trackGenerator.writable);
  const processedStream = new MediaStream();
  processedStream.addTrack(trackGenerator);

  currentProcessedStream = processedStream;
  videoEle.value?.addEventListener("loadedmetadata", () => {
    videoEle.value?.play();
  });
  videoEle.value.srcObject = processedStream;

})

function shapeTransform(width: number, height: number): Array<number> {
  // Make spatial dims divisible by 32
  let wNew = Math.ceil(width / 32) * 16;
  let hNew = Math.ceil(height / 32) * 16;

  const scaleW = wNew / width;
  const scaleH = hNew / height;

  return [wNew, hNew, scaleW, scaleH];
}

const canvas = new OffscreenCanvas(1920, 1080);
const ctx = canvas.getContext("2d");
const ImgResizer = (img: VideoFrame, width: number, height: number): ImageData => {
  // set W-H
  // const { width, height } = img.codedRect as { width: number, height: number }
  //  calculate new w-h
  // const [wNew, hNew, scaleW, scaleH] = shapeTransform(width, height)

  ctx.drawImage(img, 0, 0, width, height)
  if (ctx !== null) {
    return ctx.getImageData(0, 0, width, height,{willReadFrequently: true})
  }
  else {
    throw new Error("canvas is empty");
  }
}


const genFrame = async (dets, bitmap, timestamp) => {
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  // ctx.fillStyle = "rgba(200, 0, 0, 0.5)";
  dets.forEach(element => {
    let Crop = roundBounds({
      x: element[0] * 2,
      y: element[1] * 2,
      width: (element[2] - element[0]) * 2,
      height: (element[3] - element[1]) * 2
    });
    let blurcanvas = copyCanvas(Crop, canvas)
    // let t = document.getElementById('canvas')
    // t.width = Crop.width
    // t.height = Crop.height
    // t.getContext('2d').drawImage(blurcanvas, 0, 0)
    blurcanvas = blurCanvas(blurcanvas)
    applyCanvas(ctx, blurcanvas, Crop)
    // StackBlur.canvasRGB(canvas, ~~element[0], ~~element[1], ~~(element[2] - element[0]), ~~(element[3] - element[1]),60)

    // ctx.fillRect(~~element[0] * 2, ~~element[1] * 2, ~~((element[2] - element[0]) * 2), ~~((element[3] - element[1]) * 2));
  });


  const newBitmap = await createImageBitmap(canvas);
  fps++
  // return new VideoFrame(newBitmap, { timestamp });
  controller1.enqueue(new VideoFrame(newBitmap, { timestamp }));

}
function reshapeArray(data, dims) {
  const [B, C, H, W] = dims;
  let index = 0;
  const reshaped = [];

  for (let b = 0; b < B; b++) {
    const batch = [];
    for (let c = 0; c < C; c++) {
      const channel = [];
      for (let h = 0; h < H; h++) {
        const row = [];
        for (let w = 0; w < W; w++) {
          row.push(data[index]);
          index++;
        }
        channel.push(row);
      }
      batch.push(channel);
    }
    reshaped.push(batch);
  }

  return reshaped;
}


const transformer = new TransformStream({
  async transform(videoFrame: VideoFrame, controller) {
    let t = Date.now()
    const bitmap = await createImageBitmap(videoFrame);
    const timestamp = videoFrame.timestamp;

    timestamp1 =videoFrame.timestamp;
    const { width, height } = videoFrame.codedRect as { width: number, height: number }
    const [wNew, hNew, scaleW, scaleH] = shapeTransform(width, height)
    const resizeImg = ImgResizer(videoFrame, wNew, hNew)

    videoFrame.close();
    // Predict
    // all tensor.fromImage use this function. Instead of call from image, call this function is more efficiently.
    const processedInput = bufferToTensor(resizeImg.data, {
      width: wNew, height: hNew
      ,
      norm: {
        mean: 1, bias: 0
      },
    })
    // const processedInput = await Tensor.fromImage(resizeImg, {

    //   norm: {
    //     mean: 1, bias: 0
    //   },
    // })
    // let t = Date.now()
    // console.log('start inference',Date.now()-t)
    const feeds = { "input.1": processedInput }
    const out = await session.value?.run(feeds)
    // console.log(Date.now()-t)
    // processedInput.dispose()

    const { 537: heatmap, 538: scale, 539: offset, 540: lms } = out
    const rs_heatmap = reshapeArray(heatmap.data, heatmap.dims)
    const rs_scale = reshapeArray(scale.data, scale.dims)
    const rs_offset = reshapeArray(offset.data, offset.dims)
    const rs_lms = reshapeArray(lms.data, lms.dims)
    const size = [hNew, wNew]
    let [dets, lmss] = decode(rs_heatmap, rs_scale, rs_offset, rs_lms, size, 0.5)
    output.value = { dets, lmss }
    // Blur Target
    // console.log(dets)
    // console.log('genframe')
    controller1 = controller
    dets1 = toRaw(dets)
    float32array = new Array(dets.length);
    for (let i = 0; i < dets.length; i++) {
      float32array[i] = new Float32Array(dets[0].length);
    }
    for (let i = 0; i < dets.length; i++) {
      for (let j = 0; j < dets[0].length; j++) {
        float32array[i][j] = dets[i][j]; // 這裡可以根據需要填入任意值
      }
    }
    // float32array = new Float32Array(toRaw(dets))
    // for (let i = 0; i < dets.length; i++) {
    //   float32array[i] = new Float32Array(dets[i]);
    // }
    // console.log('fp32array',float32array)
    // console.log(float32array.buffer)
    //console.log(dets)
    bitmap1 = bitmap
    // timestamp1 = timestamp
    // const newFrame = await genFrame(
    //   dets,
    //   bitmap,
    //   timestamp,

    // );
    // console.log('dd',Date.now()-t)
    TB()
    // console.log("time",Date.now()-t)
    // controller.enqueue([dets,bitmap,timestamp]);
    // controller.enqueue(newFrame);
    

  },
  flush(controller) {
    controller.terminate();
  }

})
const canvas1 = document.createElement("canvas");
canvas1.id = "canvas1";
const offscreen = canvas1.transferControlToOffscreen();

// let calculate1 = new Promise((resolve, reject) => {
//   let worker = new Worker('./worker.js',{type: 'module'});
//   worker.postMessage({
//     canvas: offscreen,
//     dets : float32array,
//     bitmap : bitmap1,
//     timestamp : timestamp1
    
//   },[offscreen,float32array.buffer])
//   worker.onmessage = e => {
//     resolve(e.data)
//   }
// }) 
const worker = new Worker("worker.js",{type: 'module'});
// const worker = new Worker(new URL('./worker.js', import.meta.url),{type: 'module'});
worker.postMessage({canvas: offscreen},[offscreen])
worker.onmessage = (e) => {
  // console.log("從 worker 接收到的資料", e.data); // 'Hi worker!'

  let newFrame = new VideoFrame(e.data, { timestamp:timestamp1 });
  controller1.enqueue(newFrame);
};
async function TB(){
  fps++
  worker.postMessage({
    // canvas: offscreen,
    // dets : float32array,
    dets : float32array,
    bitmap : bitmap1,
    timestamp : timestamp1
    
  },[bitmap1])
  
  // genFrame(output.value['dets'], bitmap1, timestamp1)
}

async function main() {
  // try {
  // create a new session and load the specific model.
  //
  // the model in this example contains a single MatMul node
  // it has 2 inputs: 'a'(float32, 3x4) and 'b'(float32, 4x3)
  // it has 1 output: 'c'(float32, 3x3)
  const model_options = {
    executionProviders: ['webgpu'],
    excutionMode: 'parallel' // 使用 WebGPU,
    // , enableGraphCapture: true
  };
  // const sess = await ort.InferenceSession.create('/centerface[3].onnx', model_options);
  const sess = await ort.InferenceSession.create('/centerface_mod2.onnx', model_options);
  session.value = sess

  setInterval(() => {
    console.log(fps)
    fps = 0
  }, 1000);

}

onMounted(() => {
  initFlv()
  main()

})
onUnmounted(() => {
  flvPlayer.value.unload()
  flvPlayer.value.detachMediaElement()
  flvPlayer.value.destroy()
})


</script>