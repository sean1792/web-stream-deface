// import webglFilter from './webgl-image-filter.js';
// importScripts('./webgl-image-filter.js')
// import {blurCanvas} from './image_utils.ts'
// import { Tensor } from 'onnxruntime-web';

var canvas
let ctx
let res
self.onmessage = function (e) {
    // console.log("inside")
    // let a = webglFilter()
    // const offscreen = new OffscreenCanvas()
    // init offscreen canvas control
    if(e.data){
        if(!canvas) {
            canvas = e.data.canvas
            ctx = canvas.getContext("2d");
        }
        else {
            // let array = new Float32Array(e.data.dets)
            // console.log(e.data.bitmap)
            // console.log('get data',e.data.dets)
            const width = e.data.bitmap.width;
            const height = e.data.bitmap.height;
            canvas.width = width;
            canvas.height = height;

            genFrame(e.data.dets, e.data.bitmap).then((result) => {
                // console.log(result)
                self.postMessage(result)
            })
            // console.log(res)
            // res = resolve(res)
            
        }
    }

    // const ctx = canvas.getContext("2d"); 
    // const width = bitmap.width;
    // const height = bitmap.height;
    // canvas.width = width;
    // canvas.height = height;

    

    // self.postMessage(e.data.dets)
    // self.postMessage('hi!!!!!!!')
    // let res = genFrame(e.data.dets,e.data.bitmap, e.data.timestamp)
    // self.postMessage(res)
    

}


const genFrame = async (dets, bitmap) => {
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    ctx.fillStyle = "rgba(200, 0, 0, 0.5)";
    dets.forEach(element => {
    //   let Crop = roundBounds({
    //     x: element[0] * 2,
    //     y: element[1] * 2,
    //     width: (element[2] - element[0]) * 2,
    //     height: (element[3] - element[1]) * 2
    //   });
    //   let blurcanvas = copyCanvas(Crop, canvas)
      // let t = document.getElementById('canvas')
      // t.width = Crop.width
      // t.height = Crop.height
      // t.getContext('2d').drawImage(blurcanvas, 0, 0)
    //   blurcanvas = blurCanvas(blurcanvas)
    //   applyCanvas(ctx, blurcanvas, Crop)
      // StackBlur.canvasRGB(canvas, ~~element[0], ~~element[1], ~~(element[2] - element[0]), ~~(element[3] - element[1]),60)
  
        ctx.fillRect(~~element[0] * 2, ~~element[1] * 2, ~~((element[2] - element[0]) * 2), ~~((element[3] - element[1]) * 2));
    });
  
  
    const newBitmap = await createImageBitmap(canvas);
    return newBitmap
    // fps++
    // return new VideoFrame(newBitmap, { timestamp });
    // controller1.enqueue(new VideoFrame(newBitmap, { timestamp }));
  
  }