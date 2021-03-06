﻿//<reference path="babylon.math.ts"/>

interface Face {
    A: number;
    B: number;
    C: number;
}

interface Vertex {
    Normal: BABYLON.Vector3;
    Coordinates: BABYLON.Vector3;
    WorldCoordinates: BABYLON.Vector3;
}

interface ScanLineData {
    currentY?: number;
    ndotla?: number;
    ndotlb?: number;
    ndotlc?: number;
    ndotld?: number;
}

class Camera {
    Position: BABYLON.Vector3;
    Target: BABYLON.Vector3;

    constructor() {
        this.Position = BABYLON.Vector3.Zero();
        this.Target = BABYLON.Vector3.Zero();
    }
}

class Mesh {
    Position: BABYLON.Vector3;
    Rotation: BABYLON.Vector3;
    Vertices: Vertex[];
    Faces: Face[];

    constructor(public name: string, verticesCount: number, facesCount: number) {
        this.Vertices = new Array(verticesCount);
        this.Faces = new Array(facesCount);
        this.Rotation = BABYLON.Vector3.Zero();
        this.Position = BABYLON.Vector3.Zero();
    }
}

class Renderer {
    private backbuffer: ImageData;
    private workingCanvas: HTMLCanvasElement;
    private workingContext: CanvasRenderingContext2D;
    private workingWidth: number;
    private workingHeight: number;
    private backbufferdata;
    private depthbuffer: number[];

    constructor(canvas: HTMLCanvasElement) {
        this.workingCanvas = canvas;
        this.workingWidth = canvas.width;
        this.workingHeight = canvas.height;
        this.workingContext = this.workingCanvas.getContext("2d");
        this.depthbuffer = new Array(this.workingWidth * this.workingHeight);
    }

    public clear(): void {
        this.workingContext.clearRect(0, 0, this.workingWidth, this.workingHeight);

        this.backbuffer = this.workingContext.getImageData(0, 0, this.workingWidth, this.workingHeight);

        for (var i = 0; i < this.depthbuffer.length; i++) {
            this.depthbuffer[i] = 10000000;
        }
    }

    public putPixel(x: number, y: number, z: number, color: BABYLON.Color4): void {
        this.backbufferdata = this.backbuffer.data;

        var index: number = ((x >> 0) + (y >> 0) * this.workingWidth);
        var index4: number = index * 4;

        if (this.depthbuffer[index] < z) {
            return;
        }

        this.depthbuffer[index] = z;
        this.backbufferdata[index4] = color.r * 255;
        this.backbufferdata[index4 + 1] = color.g * 255;
        this.backbufferdata[index4 + 2] = color.b * 255;
        this.backbufferdata[index4 + 3] = color.a * 255;
    }

    public drawPoint(point: BABYLON.Vector3, color: BABYLON.Color4): void {
        if (point.x >= 0 && point.y >= 0 && point.x < this.workingWidth && point.y < this.workingHeight) {
            this.putPixel(point.x, point.y, point.z, color);
        }
    }

    public present(): void {
        this.workingContext.putImageData(this.backbuffer, 0, 0);
    }

    public clamp(value: number, min: number = 0, max: number = 1): number {
        return Math.max(min, Math.min(value, max));
    }

    public interpolate(min: number, max: number, gradient: number) {
        return min + (max - min) * this.clamp(gradient);
    }

    public project(vertex: Vertex, transMat: BABYLON.Matrix, world: BABYLON.Matrix): Vertex {
        var point2d = BABYLON.Vector3.TransformCoordinates(vertex.Coordinates, transMat);
        var point3DWorld = BABYLON.Vector3.TransformCoordinates(vertex.Coordinates, world);
        var normal3DWorld = BABYLON.Vector3.TransformCoordinates(vertex.Normal, world);

        var x = point2d.x * this.workingWidth + this.workingWidth / 2.0;
        var y = -point2d.y * this.workingHeight + this.workingHeight / 2.0;

        return ({
            Coordinates: new BABYLON.Vector3(x, y, point2d.z),
            Normal: normal3DWorld,
            WorldCoordinates: point3DWorld
        });
    }

    public processScanLine(data: ScanLineData, va: Vertex, vb: Vertex, vc: Vertex, vd: Vertex, color: BABYLON.Color4): void {
        var pa = va.Coordinates;
        var pb = vb.Coordinates;
        var pc = vc.Coordinates;
        var pd = vd.Coordinates;

        var gradient1 = pa.y != pb.y ? (data.currentY - pa.y) / (pb.y - pa.y) : 1;
        var gradient2 = pc.y != pd.y ? (data.currentY - pc.y) / (pd.y - pc.y) : 1;

        var sx = this.interpolate(pa.x, pb.x, gradient1) >> 0;
        var ex = this.interpolate(pc.x, pd.x, gradient2) >> 0;

        var z1: number = this.interpolate(pa.z, pb.z, gradient1);
        var z2: number = this.interpolate(pc.z, pd.z, gradient2);

        for (var x = sx; x < ex; x++) {
            var gradient: number = (x - sx) / (ex - sx);

            var z = this.interpolate(z1, z2, gradient);
            var ndotl = data.ndotla;
            this.drawPoint(new BABYLON.Vector3(x, data.currentY, z), new BABYLON.Color4(color.r * ndotl, color.g * ndotl, color.b * ndotl, 1));
        }
    }

    public computeNDotL(vertex: BABYLON.Vector3, normal: BABYLON.Vector3, lightPosition: BABYLON.Vector3): number {
        var lightDirection = lightPosition.subtract(vertex);

        normal.normalize();
        lightDirection.normalize();

        return Math.max(0, BABYLON.Vector3.Dot(normal, lightDirection));
    }

    public drawTriangle(v1: Vertex, v2: Vertex, v3: Vertex, color: BABYLON.Color4): void {
        if (v1.Coordinates.y > v2.Coordinates.y) {
            var temp = v2;
            v2 = v1;
            v1 = temp;
        }

        if (v2.Coordinates.y > v3.Coordinates.y) {
            var temp = v2;
            v2 = v3;
            v3 = temp;
        }

        if (v1.Coordinates.y > v2.Coordinates.y) {
            var temp = v2;
            v2 = v1;
            v1 = temp;
        }

        var p1 = v1.Coordinates;
        var p2 = v2.Coordinates;
        var p3 = v3.Coordinates;

        var vnFace = (v1.Normal.add(v2.Normal.add(v3.Normal))).scale(1 / 3);
        var centerPoint = (v1.WorldCoordinates.add(v2.WorldCoordinates.add(v3.WorldCoordinates))).scale(1 / 3);

        var lightPos = new BABYLON.Vector3(0, 10, 10);

        var ndotl = this.computeNDotL(centerPoint, vnFace, lightPos);

        var data: ScanLineData = { ndotla: ndotl };

        var dP1P2: number; var dP1P3: number;

        if (p2.y - p1.y > 0)
            dP1P2 = (p2.x - p1.x) / (p2.y - p1.y);
        else
            dP1P2 = 0;

        if (p3.y - p1.y > 0)
            dP1P3 = (p3.x - p1.x) / (p3.y - p1.y);
        else
            dP1P3 = 0;

        // P1
        // -
        // -- 
        // - -
        // -  -
        // -   - P2
        // -  -
        // - -
        // -
        // P3
        if (dP1P2 > dP1P3) {
            for (var y = p1.y >> 0; y <= p3.y >> 0; y++) {
                data.currentY = y;

                if (y < p2.y) {
                    this.processScanLine(data, v1, v3, v1, v2, color);
                }
                else {
                    this.processScanLine(data, v1, v3, v2, v3, color);
                }
            }
        }
        //       P1
        //        -
        //       -- 
        //      - -
        //     -  -
        // P2 -   - 
        //     -  -
        //      - -
        //        -
        //       P3
        else {
            for (var y = p1.y >> 0; y <= p3.y >> 0; y++) {
                data.currentY = y;

                if (y < p2.y) {
                    this.processScanLine(data, v1, v2, v1, v3, color);
                }
                else {
                    this.processScanLine(data, v2, v3, v1, v3, color);
                }
            }
        }
    }

    public render(camera: Camera, meshes: Mesh[]): void {
        var viewMatrix = BABYLON.Matrix.LookAtLH(camera.Position, camera.Target, BABYLON.Vector3.Up());
        var projectionMatrix = BABYLON.Matrix.PerspectiveFovLH(0.78, this.workingWidth / this.workingHeight, 0.01, 1.0);

        for (var index = 0; index < meshes.length; index++) {
            var cMesh = meshes[index];
            var worldMatrix = BABYLON.Matrix.RotationYawPitchRoll(
                cMesh.Rotation.y, cMesh.Rotation.x, cMesh.Rotation.z)
                .multiply(BABYLON.Matrix.Translation(
                    cMesh.Position.x, cMesh.Position.y, cMesh.Position.z));

            var transformMatrix = worldMatrix.multiply(viewMatrix).multiply(projectionMatrix);

            for (var indexFaces = 0; indexFaces < cMesh.Faces.length; indexFaces++) {
                var currentFace = cMesh.Faces[indexFaces];
                var vertexA = cMesh.Vertices[currentFace.A];
                var vertexB = cMesh.Vertices[currentFace.B];
                var vertexC = cMesh.Vertices[currentFace.C];

                var pixelA = this.project(vertexA, transformMatrix, worldMatrix);
                var pixelB = this.project(vertexB, transformMatrix, worldMatrix);
                var pixelC = this.project(vertexC, transformMatrix, worldMatrix);

                var color = 1.0;
                this.drawTriangle(pixelA, pixelB, pixelC, new BABYLON.Color4(color, color, color, 1));
            }
        }
    }

    public loadJsonFileAsync(fileName: string, callback: (result: Mesh[]) => any): void {
        var jsonObject = {};
        var xmlhttp = new XMLHttpRequest();
        xmlhttp.open("GET", fileName, true);
        var self = this;
        xmlhttp.onreadystatechange = function () {
            if (xmlhttp.readyState == 4 && xmlhttp.status == 200) {
                jsonObject = JSON.parse(xmlhttp.responseText);
                callback(self.createMeshesFromJSON(jsonObject));
            }
        };
        xmlhttp.send(null);
    }

    private createMeshesFromJSON(jsonObject): Mesh[] {
        var meshes: Mesh[] = [];
        for (var meshIndex = 0; meshIndex < jsonObject.meshes.length; meshIndex++) {
            var verticesArray: number[] = jsonObject.meshes[meshIndex].vertices;
            var indicesArray: number[] = jsonObject.meshes[meshIndex].indices;

            var uvCount: number = jsonObject.meshes[meshIndex].uvCount;
            var verticesStep = 1;

            switch (uvCount) {
                case 0:
                    verticesStep = 6;
                    break;
                case 1:
                    verticesStep = 8;
                    break;
                case 2:
                    verticesStep = 10;
                    break;
            }

            var verticesCount = verticesArray.length / verticesStep;
            var facesCount = indicesArray.length / 3;
            var mesh = new Mesh(jsonObject.meshes[meshIndex].name, verticesCount, facesCount);

            for (var index = 0; index < verticesCount; index++) {
                var x = verticesArray[index * verticesStep];
                var y = verticesArray[index * verticesStep + 1];
                var z = verticesArray[index * verticesStep + 2];
                var nx = verticesArray[index * verticesStep + 3];
                var ny = verticesArray[index * verticesStep + 4];
                var nz = verticesArray[index * verticesStep + 5];
                mesh.Vertices[index] = {
                    Coordinates: new BABYLON.Vector3(x, y, z),
                    Normal: new BABYLON.Vector3(nx, ny, nz),
                    WorldCoordinates: null
                };
            }

            for (var index = 0; index < facesCount; index++) {
                var a = indicesArray[index * 3];
                var b = indicesArray[index * 3 + 1];
                var c = indicesArray[index * 3 + 2];
                mesh.Faces[index] = {
                    A: a,
                    B: b,
                    C: c
                };
            }
            var position = jsonObject.meshes[meshIndex].position;
            mesh.Position = new BABYLON.Vector3(position[0], position[1], position[2]);
            meshes.push(mesh);
        }
        return meshes;
    }
}

var canvas: HTMLCanvasElement;
var divCurrentFPS;
var divAverageFPS;
var renderer: Renderer;
var mesh: Mesh;
var meshes: Mesh[] = [];
var camera: Camera;
var previousDate = Date.now();
var lastFPSValues = new Array(60);

document.addEventListener("DOMContentLoaded", init, false);

function init() {

    canvas = <HTMLCanvasElement>document.getElementById("frontBuffer");
    camera = new Camera();
    renderer = new Renderer(canvas);
    divCurrentFPS = document.getElementById("currentFPS");
    divAverageFPS = document.getElementById("averageFPS");

    camera.Position = new BABYLON.Vector3(0, 0, 10);
    camera.Target = new BABYLON.Vector3(0, 0, 0);

    renderer.loadJsonFileAsync("monkey.json", loadJsonCompleted);
}

function loadJsonCompleted(meshesLoaded: Mesh[]) {
    meshes = meshesLoaded;
    requestAnimationFrame(drawingLoop);
}

function drawingLoop() {

    var now = Date.now();
    var currentFPS = 1000 / (now - previousDate);
    previousDate = now;

    divCurrentFPS.textContent = currentFPS.toFixed(2);

    if (lastFPSValues.length < 60) {
        lastFPSValues.push(currentFPS);
    } else {
        lastFPSValues.shift();
        lastFPSValues.push(currentFPS);
        var totalValues = 0;
        for (var i = 0; i < lastFPSValues.length; i++) {
            totalValues += lastFPSValues[i];
        }

        var averageFPS = totalValues / lastFPSValues.length;
        divAverageFPS.textContent = averageFPS.toFixed(2);
    }

    renderer.clear();

    for (let i = 0; i < meshes.length; i++) {
        //meshes[i].Rotation.x += 0.01;
        meshes[i].Rotation.y += 0.01;
    }

    renderer.render(camera, meshes);
    renderer.present();

    requestAnimationFrame(drawingLoop);
}