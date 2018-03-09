/*
* @Author: anchen
* @Date:   2018-02-07 19:46:55
* @Last Modified by:   anchen
* @Last Modified time: 2018-03-09 19:40:29
*/
var fs = require('fs');
var path = require('path');
var PSD = require('psd');
const imagemin = require('imagemin');
const imageminPngquant = require('imagemin-pngquant');
//var images = require("images");

// Load in our dependencies
var Pixelsmith = require('pixelsmith');

// Create a new engine
var pixelsmith = new Pixelsmith();

var getFiles=function(filePath){
    var files=[];
    var getFilesLoop=function(filePath){
        var filesCurrent=fs.readdirSync(filePath);
        for(let i=0;i<filesCurrent.length;i++){
            var fileStatCurrent={};
            fileStatCurrent.path=path.join(filePath,filesCurrent[i]);
            try{
                fileStatCurrent.stats=fs.statSync(fileStatCurrent.path);
                files.push(fileStatCurrent);
                if(fileStatCurrent.stats.isDirectory()){
                    if(fileStatCurrent.path.indexOf('.asar')!=(fileStatCurrent.path.length-5)){//.asar做为文件处理
                        getFilesLoop(fileStatCurrent.path);
                    }
                }
            }catch(e){
                //console.log(e)
            }
        }
    }
    getFilesLoop(filePath);
    return files;
}
function scanTree(psdfile,processing){
    var scanTreeOrg=function(Layer,processing){
        if (Layer.type == 'group' && Layer.visible) {
            for(let layerItem of Layer.children) {
                scanTreeOrg(layerItem,processing);
            }
        }
        if(Layer.type == 'layer' && Layer.visible){
            processing(Layer);
        };
    }
    var psd = PSD.fromFile(psdfile);
    if (psd.parse()) {
        var psdTreeExport = psd.tree().export();
        for(let layer of psdTreeExport.children) {
            scanTreeOrg(layer,processing);
        }
    }
}
function psd2pngmix(psdfile,cb){
    var psdfile=psdfile.path;
    if(psdfile.indexOf('.psd') == -1){
        cb()
        return;
    }
    // var scanTree = function (Layer) {
    //     if (Layer.type == 'group' && Layer.visible) {
    //         for(let layerItem of Layer.children) {
    //             scanTree(layerItem);
    //         }
    //     }
    //     if (Layer.name.indexOf('.psd') != '-1' && Layer.visible) {
    //         replaceLayers.push(Layer);
    //         replaceLayersRecord.push(Layer);
    //     };
    // }
    var replaceLayers = [];
    var replaceLayersRecord = [];
    //console.log(psdfile);
    var psd = PSD.fromFile(psdfile);
    if (psd.parse()) {
        scanTree(psdfile,function(Layer){
            if(Layer.name.indexOf('.psd') != '-1'){
                replaceLayers.push(Layer);
                replaceLayersRecord.push(Layer);
            }
        })
        var destPath = path.join(path.dirname(psdfile), path.basename(psdfile, '.psd') + '.png');
                var toPngData=[];
        var dataNow = psd.image.toPng();//直接导出的图片
        var readableSteamPng = dataNow.pack();
        readableSteamPng.on('data',function(chunk){
            toPngData.push(chunk);
        })

        readableSteamPng.on('end',function(){
            let imgCurrbuff = Buffer.concat(toPngData);
            //导出png图片;如果有符合条件的图层，则拼接后输出
            imageminPngquant()(imgCurrbuff).then(function(imgCurrbuffCompressed){
                fs.writeFileSync(destPath,imgCurrbuffCompressed);

                //递归替换对应图层
                var resolveReady = [];
                function replaceLayersToPng(layers, callback) {
                    if (layers.length == 0) {
                        callback();
                    } else {
                        var layersCurr = layers.splice(-1)[0];
                        var layersCurrPath = path.join(path.dirname(psdfile), layersCurr.name);
    //                    console.log(layersCurrPath);
                        if (!resolveReady.some(function (val) { return val == layersCurrPath })) {
                            if (fs.existsSync(layersCurrPath)) {
                                var psdCurr = PSD.fromFile(layersCurrPath);
                                if(psdCurr.parse()){
                                    //psdCurr.tree()._children[0].saveAsPng(path.join(path.dirname(layersCurrPath), path.basename(layersCurrPath, '.psd') + '3.png'));
                                    psdCurr.image.saveAsPng(path.join(path.dirname(layersCurrPath), path.basename(layersCurrPath, '.psd') + '.png')).then(function () {
                                        replaceLayersToPng(layers, callback);
                                    });
                                }else{
                                    replaceLayersToPng(layers, callback);
                                }
                            } else {
                                replaceLayersToPng(layers, callback);
                            }
                        } else {
                            replaceLayersToPng(layers, callback);
                        }
                    }
                }
                replaceLayersToPng(replaceLayers, function () {
                   // var imageCurr = images(destPath);
                    var imagesAll=[destPath];
                    var imagesAllInfo=[destPath];
                    for(let layer of replaceLayersRecord) {
                        var layersCurrPath = path.join(path.dirname(psdfile), layer.name);
                        var layersCurrPng = path.join(path.dirname(layersCurrPath), path.basename(layersCurrPath, '.psd') + '.png');
                        if (fs.existsSync(layersCurrPng)) {
                            //var imageWater = images(layersCurrPng);
                            var x = layer.left < 0 ? 0 : layer.left;
                            var y = layer.top < 0 ? 0 : layer.top;
                           // imageWater.resize(layer.width, layer.height);
                           // imageCurr.draw(imageWater, x, y);
                            imagesAll.push(layersCurrPng);
                            imagesAllInfo.push({path:layersCurrPng,x:x,y:y});
                        }
                    };
                    // console.log(imagesAll);
                    // console.log(imagesAllInfo);
                    console.log(imagesAll);
                    if(imagesAll.length>1){
                        pixelsmith.createImages(imagesAll, function handleImages (err, imgs) {
                          // If there was an error, throw it
                          if (err) {
                            throw err;
                          }

                          // Create a canvas that fits our images (200px wide, 300px tall)
                          var canvas = pixelsmith.createCanvas(imgs[0].width, imgs[0].height);

                          // Add the images to our canvas (at x=0, y=0 and x=50, y=100 respectively)
                          canvas.addImage(imgs[0], 0, 0);
                          for(var i = 1; i<imagesAllInfo.length; i++){
                            canvas.addImage(imgs[i],imagesAllInfo[i].x,imagesAllInfo[i].y);
                          }
                          // Export canvas to image
                          let finalImgBuffArr = [];
                          let resultStream = canvas['export']({format: 'png'});
                          resultStream.on('data',function(chunk){
                            finalImgBuffArr.push(chunk);
                          });
                          resultStream.on('end',function(){
                              imageminPngquant()(Buffer.concat(finalImgBuffArr)).then(function(rst){
                                fs.writeFileSync(imagesAll[0],rst);
                                cb(imagesAll[0]);
                              },function(err){
                                cb(imagesAll[0]);
                              });
                          })
                          // var writeStream = fs.createWriteStream(imagesAll[0]);
                          // resultStream.pipe(writeStream);

                        });
                    }else{
                            cb(imagesAll[0]);
                    }
                    //imageCurr.save(destPath);
                });

            })
        })

        //scanTree(psdTree);

        //psdTree._children[0].saveAsPng('s.png',function(e){});
        // fs.writeFile('4.psd',psdTree.children()[0].layer.file.data,function(e){console.log(e)});
    };
}
function psd2pngmixauto(path,cbauto){
    var allFile=[];
    if(fs.existsSync(path)){
        var pathInfo=fs.statSync(path);
        if(pathInfo.isDirectory()){
            allFile = getFiles(path);
        }else{
            allFile.push({path:path});
        }
        var parseAllFile=function(arr,cbauto){
            if(arr.length==0){
                cbauto();
            }else{
                var fileCurr=arr.splice(-1)[0];
                psd2pngmix(fileCurr,function(filename){cbauto(filename);parseAllFile(arr,cbauto)});
            }
        }
        parseAllFile(allFile,cbauto);
    }else{
        cbauto();
        console.log('没有该文件');
    }
};
module.exports = {scanTree:scanTree,psd2pngmix:psd2pngmix,psd2pngmixauto:psd2pngmixauto}


// images("input.png")                     //Load image from file
//                                         //加载图像文件
//     .size(400)                          //Geometric scaling the image to 400 pixels width
//                                         //等比缩放图像到400像素宽
//     .draw(images("logo.png"), 10, 10)   //Drawn logo at coordinates (10,10)
//                                         //在(10,10)处绘制Logo
//     .save("output.png", {               //Save the image to a file, with the quality of 50
//         quality: 50                    //保存图片到文件,图片质量为50
//     });

