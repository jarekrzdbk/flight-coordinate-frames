"use strict";

const view=$("view");
const projectionCanvas=$("combined");
const sphericalCanvas=$("spherical-canvas");
const axesButton=$("show-axes");
const sphericalButton=$("show-spherical");
let projectionMode=new URLSearchParams(location.search).get("projection")==="spherical"
    ?"spherical"
    :"axes";

function updateProjectionPresentation(){
    const spherical=projectionMode==="spherical";
    const needsResize=(spherical?sphericalCanvas:projectionCanvas).hidden;
    projectionCanvas.hidden=spherical;
    sphericalCanvas.hidden=!spherical;
    axesButton.classList.toggle("active",!spherical);
    sphericalButton.classList.toggle("active",spherical);
    axesButton.setAttribute("aria-pressed",String(!spherical));
    sphericalButton.setAttribute("aria-pressed",String(spherical));
    if(needsResize)requestAnimationFrame(spherical?resizeSpherical:resizeProjection);
}

function setProjectionMode(mode){
    projectionMode=mode;
    updateProjectionPresentation();
}

axesButton.addEventListener("click",()=>setProjectionMode("axes"));
sphericalButton.addEventListener("click",()=>setProjectionMode("spherical"));

const renderer=new THREE.WebGLRenderer({antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
view.appendChild(renderer.domElement);

const scene=new THREE.Scene();
scene.background=new THREE.Color(0xf6f7f4);
const camera=new THREE.PerspectiveCamera(45,1,0.1,100);
scene.add(new THREE.AmbientLight(0xffffff,0.75));
const light=new THREE.DirectionalLight(0xffffff,0.7);
scene.add(light);

const dynamicGroup=new THREE.Group();
scene.add(dynamicGroup);

let camAzimuth=-3*Math.PI/4;
let camElevation=Math.asin(1/Math.sqrt(3));
let camR=4.4;
let drag=false,px=0,py=0;

function placeCamera(){
    const config=CONFIG[state.convention];
    const aspect=view.clientWidth/Math.max(1,view.clientHeight);
    const radius=camR*(aspect<1?1.35:1);
    camera.up.copy(config.up);
    if(state.convention==="ned"){
        camera.position.set(radius*Math.cos(camElevation)*Math.cos(camAzimuth),radius*Math.cos(camElevation)*Math.sin(camAzimuth),-radius*Math.sin(camElevation));
        light.position.set(3,5,-3);
    }else{
        camera.position.set(radius*Math.cos(camElevation)*Math.cos(camAzimuth),radius*Math.sin(camElevation),radius*Math.cos(camElevation)*Math.sin(camAzimuth));
        light.position.set(3,5,2);
    }
    camera.lookAt(0,0,0);
}

function resetCamera(){
    camAzimuth=CONFIG[state.convention].defaultAzimuth;
    camElevation=Math.asin(1/Math.sqrt(3));
    camR=4.4;
    placeCamera();
}

view.addEventListener("pointerdown",e=>{
    drag=true;px=e.clientX;py=e.clientY;view.setPointerCapture(e.pointerId);
});
view.addEventListener("pointermove",e=>{
    if(!drag)return;
    camAzimuth-=(e.clientX-px)*0.006;
    camElevation=clamp(camElevation+(e.clientY-py)*0.006,-1.5,1.5);
    px=e.clientX;py=e.clientY;placeCamera();
});
view.addEventListener("pointerup",e=>{
    drag=false;
    if(view.hasPointerCapture(e.pointerId))view.releasePointerCapture(e.pointerId);
});
view.addEventListener("wheel",e=>{
    e.preventDefault();
    camR=clamp(camR+e.deltaY*0.002,2,10);
    placeCamera();
},{passive:false});

function arrow(dir,color,len=1.35,head=0.08,dashed=false){
    const d=dir.clone().normalize();
    const geometry=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),d.clone().multiplyScalar(len)]);
    const material=dashed?new THREE.LineDashedMaterial({color,dashSize:0.06,gapSize:0.04}):new THREE.LineBasicMaterial({color});
    const line=new THREE.Line(geometry,material);
    if(dashed)line.computeLineDistances();
    dynamicGroup.add(line);

    const cone=new THREE.Mesh(new THREE.ConeGeometry(head*0.45,head,10),new THREE.MeshBasicMaterial({color}));
    cone.position.copy(d).multiplyScalar(len);
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d);
    dynamicGroup.add(cone);
}

function label(textValue,pos,color="#222",size=0.36){
    if(!textValue)return;
    const canvas=document.createElement("canvas");
    canvas.height=64;
    let ctx=canvas.getContext("2d");
    ctx.font="bold 40px Georgia";
    canvas.width=Math.max(96,Math.ceil(ctx.measureText(textValue).width+20));
    ctx=canvas.getContext("2d");
    ctx.font="bold 40px Georgia";
    ctx.fillStyle=color;
    ctx.textAlign="center";
    ctx.fillText(textValue,canvas.width/2,44);

    const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(canvas),depthTest:false}));
    sprite.scale.set(size*canvas.width/128,size/2,1);
    sprite.position.copy(pos);
    dynamicGroup.add(sprite);
}

function rotationArcPoints(start,axis,angle,r=1,count=48){
    if(Math.abs(angle)<1e-7)return null;
    const a=start.clone().normalize(),n=axis.clone().normalize(),points=[];
    for(let i=0;i<=count;i++)points.push(a.clone().applyAxisAngle(n,angle*i/count).multiplyScalar(r));
    return points;
}

function arc(start,axis,angle,color,r=1.1){
    const points=rotationArcPoints(start,axis,angle,r);
    if(!points)return;

    dynamicGroup.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(points),
        new THREE.LineBasicMaterial({color})
    ));

    const tip=points.at(-1);
    const direction=tip.clone().sub(points.at(-2)).normalize();
    const cone=new THREE.Mesh(new THREE.ConeGeometry(0.025,0.07,8),new THREE.MeshBasicMaterial({color}));
    cone.position.copy(tip);
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction);
    dynamicGroup.add(cone);
}

function makeAircraft(){
    const group=new THREE.Group();
    const material=new THREE.MeshStandardMaterial({color:0x4b5563,metalness:0.15,roughness:0.7});

    const fuselage=new THREE.Mesh(new THREE.CylinderGeometry(0.035,0.06,0.8,12),material);
    fuselage.rotation.z=-Math.PI/2;
    group.add(fuselage);

    const nose=new THREE.Mesh(new THREE.ConeGeometry(0.06,0.16,12),material);
    nose.rotation.z=-Math.PI/2;
    nose.position.x=0.48;
    group.add(nose);

    const wing=new THREE.Mesh(new THREE.BoxGeometry(0.22,0.9,0.015),material);
    wing.position.x=0.05;
    group.add(wing);

    const tail=new THREE.Mesh(new THREE.BoxGeometry(0.12,0.34,0.015),material);
    tail.position.x=-0.34;
    group.add(tail);

    const fin=new THREE.Mesh(new THREE.BoxGeometry(0.12,0.015,0.16),material);
    fin.position.set(-0.34,0,-0.09);
    group.add(fin);

    const marker=new THREE.Mesh(new THREE.BoxGeometry(0.05,0.05,0.02),new THREE.MeshStandardMaterial({color:0xc62828}));
    marker.position.set(0.05,0.45,-0.02);
    group.add(marker);

    group.scale.setScalar(0.75);
    return group;
}

const aircraftFrame=new THREE.Group();
const aircraftModel=makeAircraft();
const nedToYup=new THREE.Matrix4().set(1,0,0,0,0,0,-1,0,0,1,0,0,0,0,0,1);
aircraftFrame.add(aircraftModel);
scene.add(aircraftFrame);

function setAircraftConvention(){
    aircraftModel.setRotationFromMatrix(state.convention==="ned"?identity():nedToYup);
}

function clearDynamic(){
    dynamicGroup.traverse(object=>{
        if(object.geometry)object.geometry.dispose();
        if(object.material){
            const materials=Array.isArray(object.material)?object.material:[object.material];
            for(const material of materials){
                if(material.map)material.map.dispose();
                material.dispose();
            }
        }
    });
    dynamicGroup.clear();
}

function drawFrame3d(M,labels,color,dashed=false,length=1.12,indices=[0,1,2]){
    for(const i of indices){
        const v=matrixColumn(M,i);
        arrow(v,color,length,0.05,dashed);
        label(labels[i],v.clone().multiplyScalar(length+0.14),typeof color==="number"?`#${color.toString(16).padStart(6,"0")}`:color,0.28);
    }
}

function drawStageArcs3d(data){
    for(let i=0;i<state.step;i++){
        const stage=data.stages[i];
        for(const k of stage.moved){
            arc(matrixColumn(stage.start,k),stage.axisWorld,stage.angle,stageColor(i));
        }
    }
}

function draw3d(data,labels){
    clearDynamic();
    const currentFixed=state.step>0?data.stages[state.step-1].fixedIndex:null;

    for(let i=0;i<3;i++){
        const v=matrixColumn(data.frames[0],i);
        arrow(v,0x1b2430);
        if(state.step!==0&&!(state.step===1&&i===currentFixed))
            label(labels[0][i],v.clone().multiplyScalar(1.52));
    }

    for(let frame=1;frame<state.step;frame++){
        const previousLabels=labels[frame].map((value,i)=>
            frame===state.step-1&&i===currentFixed?null:value
        );
        drawFrame3d(data.frames[frame],previousLabels,0x9aa0a6,true,1.08,data.stages[frame-1].moved);
    }

    const current=data.frames[state.step];
    const colors=[0xc62828,0x2e7d32,0x1a4fd6];
    const css=[COLORS.x,COLORS.y,COLORS.z];

    for(let i=0;i<3;i++){
        const v=matrixColumn(current,i);
        arrow(v,colors[i]);
        label(currentFrameLabel(labels,i),v.clone().multiplyScalar(1.52),css[i]);
    }

    drawStageArcs3d(data);
    aircraftFrame.setRotationFromMatrix(current);
    aircraftFrame.visible=true;
}

function projectVector(v){
    const projection=CONFIG[state.convention].projection;
    return [
        v.x*projection[0][0]+v.y*projection[1][0]+v.z*projection[2][0],
        v.x*projection[0][1]+v.y*projection[1][1]+v.z*projection[2][1]
    ];
}

function drawCombined(data,labels){
    const canvas=projectionCanvas,ctx=canvas.getContext("2d");
    const W=canvas.width,H=canvas.height,cx=W/2,cy=H*0.48,scale=Math.min(W,H)*0.27;
    const fs=clamp(Math.round(Math.min(W,H)*0.04),11,19);
    const P=v=>{const q=projectVector(v);return[cx+scale*q[0],cy-scale*q[1]];};

    const segment=(a,b,color,width=1.6,dash=[])=>{
        ctx.strokeStyle=color;ctx.lineWidth=width;ctx.setLineDash(dash);
        ctx.beginPath();ctx.moveTo(...P(a));ctx.lineTo(...P(b));ctx.stroke();ctx.setLineDash([]);
    };

    const head=(a,b,color,size=7)=>{
        const p0=P(a),p1=P(b),d=Math.atan2(p1[1]-p0[1],p1[0]-p0[0]);
        ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(...p1);
        ctx.lineTo(p1[0]-size*Math.cos(d-.45),p1[1]-size*Math.sin(d-.45));
        ctx.lineTo(p1[0]-size*Math.cos(d+.45),p1[1]-size*Math.sin(d+.45));
        ctx.closePath();ctx.fill();
    };

    const text=(value,v,color,font=`${fs}px Georgia`)=>{
        if(!value)return;
        const p=P(v);ctx.fillStyle=color;ctx.font=font;
        const tw=ctx.measureText(value).width;
        ctx.fillText(value,clamp(p[0]-4,3,W-tw-4),clamp(p[1],fs+2,H-4));
    };

    const O=new THREE.Vector3();
    const currentFixed=state.step>0?data.stages[state.step-1].fixedIndex:null;
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle="#fff";
    ctx.fillRect(0,0,W,H);
    ctx.fillStyle="#555";
    ctx.font=`italic ${Math.max(11,fs-2)}px Segoe UI`;
    const viewName=state.transformation==="airDirection"?"normal CS → air CS 1a"
        :state.transformation==="airBank"?"air CS 1a → velocity CS a"
        :state.transformation==="airVelocity"?"normal CS → velocity CS a via 1a"
        :state.transformation==="airBody"?"velocity CS a"
        :state.convention==="ned"?"NED reference":"Y-up ground reference";
    ctx.fillText(`fixed 2D view · ${viewName}`,10,16);

    for(let i=0;i<3;i++){
        const v=matrixColumn(data.frames[0],i);
        segment(O,v,COLORS.ink);head(O,v,COLORS.ink);
        if(state.step!==0&&!(state.step===1&&i===currentFixed))
            text(labels[0][i],v.clone().multiplyScalar(1.17),COLORS.ink);
    }

    for(let frame=1;frame<state.step;frame++){
        for(const i of data.stages[frame-1].moved){
            const v=matrixColumn(data.frames[frame],i);
            segment(O,v.clone().multiplyScalar(.9),COLORS.grey,1,[5,4]);
            if(!(frame===state.step-1&&i===currentFixed))
                text(labels[frame][i],v.clone().multiplyScalar(1.02),COLORS.grey,`${Math.max(10,fs-2)}px Georgia`);
        }
    }

    const current=data.frames[state.step];
    const bodyColors=[COLORS.x,COLORS.y,COLORS.z];

    for(let i=0;i<3;i++){
        const v=matrixColumn(current,i);
        segment(O,v,bodyColors[i],2.5);head(O,v,bodyColors[i],8);
        text(currentFrameLabel(labels,i),v.clone().multiplyScalar(1.17),bodyColors[i],`bold ${fs+1}px Georgia`);
    }

    for(let stageIndex=0;stageIndex<state.step;stageIndex++){
        const stage=data.stages[stageIndex];
        let labelled=false;

        for(const k of stage.moved){
            const points=rotationArcPoints(matrixColumn(stage.start,k),stage.axisWorld,stage.angle,1.06,40);
            if(!points)continue;

            const color=stageColor(stageIndex);
            ctx.strokeStyle=color;
            ctx.lineWidth=1.5;
            ctx.beginPath();
            points.forEach((v,i)=>{const p=P(v);i?ctx.lineTo(...p):ctx.moveTo(...p);});
            ctx.stroke();
            head(points.at(-2),points.at(-1),color,6);

            if(!labelled){
                const mid=points[Math.floor(points.length/2)].clone().multiplyScalar(1.2);
                text(activeAngleSymbols()[stageIndex],mid,color,`bold ${fs+1}px Georgia`);
                labelled=true;
            }
        }
    }
}

function drawSpherical(data,labels){
    const canvas=sphericalCanvas,ctx=canvas.getContext("2d");
    const W=canvas.width,H=canvas.height;
    const cx=W/2,cy=H*.52,scale=Math.min(W,H)*.34;
    const fontSize=clamp(Math.round(Math.min(W,H)*.035),12,18);
    const P=v=>{
        const q=projectVector(v);
        return [cx+scale*q[0],cy-scale*q[1]];
    };
    const O=new THREE.Vector3();

    const path=(points,color,width=1,dash=[])=>{
        if(points.length<2)return;
        ctx.strokeStyle=color;ctx.lineWidth=width;ctx.setLineDash(dash);
        ctx.beginPath();
        points.forEach((point,index)=>{
            const p=P(point);
            index?ctx.lineTo(...p):ctx.moveTo(...p);
        });
        ctx.stroke();ctx.setLineDash([]);
    };
    const segment=(a,b,color,width=1.5,dash=[])=>path([a,b],color,width,dash);
    const head=(a,b,color,size=7)=>{
        const p0=P(a),p1=P(b),angle=Math.atan2(p1[1]-p0[1],p1[0]-p0[0]);
        ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(...p1);
        ctx.lineTo(p1[0]-size*Math.cos(angle-.45),p1[1]-size*Math.sin(angle-.45));
        ctx.lineTo(p1[0]-size*Math.cos(angle+.45),p1[1]-size*Math.sin(angle+.45));
        ctx.closePath();ctx.fill();
    };
    const text=(value,v,color,bold=false,offset=[0,0])=>{
        if(!value)return;
        const p=P(v);
        ctx.font=`${bold?"bold ":""}${fontSize}px Georgia`;
        const metrics=ctx.measureText(value);
        const x=clamp(p[0]+offset[0],metrics.width/2+5,W-metrics.width/2-5);
        const y=clamp(p[1]+offset[1],fontSize+5,H-6);
        ctx.fillStyle="rgba(255,255,255,.58)";
        ctx.fillRect(x-metrics.width/2-3,y-fontSize,metrics.width+6,fontSize+5);
        ctx.fillStyle=color;ctx.textAlign="center";ctx.fillText(value,x,y);
    };
    const arrow=(v,color,width=1.7,labelValue=null,bold=false)=>{
        segment(O,v,color,width);head(O,v,color,width>2?8:7);
        text(labelValue,v.clone().multiplyScalar(1.15),color,bold);
    };
    const circleInPlane=axis=>{
        const n=axis.clone().normalize();
        const helper=Math.abs(n.z)<.85
            ?new THREE.Vector3(0,0,1)
            :new THREE.Vector3(0,1,0);
        const u=new THREE.Vector3().crossVectors(n,helper).normalize();
        const v=new THREE.Vector3().crossVectors(n,u).normalize();
        const points=[];
        for(let i=0;i<=96;i++){
            const angle=2*Math.PI*i/96;
            points.push(u.clone().multiplyScalar(Math.cos(angle))
                .add(v.clone().multiplyScalar(Math.sin(angle))));
        }
        return points;
    };

    ctx.clearRect(0,0,W,H);
    ctx.fillStyle="#fff";ctx.fillRect(0,0,W,H);
    ctx.strokeStyle="rgba(138,144,150,.42)";
    ctx.lineWidth=1;
    ctx.beginPath();ctx.arc(cx,cy,scale,0,2*Math.PI);ctx.stroke();

    if(state.step===0){
        for(const axis of [
            new THREE.Vector3(1,0,0),
            new THREE.Vector3(0,1,0),
            new THREE.Vector3(0,0,1)
        ])path(circleInPlane(axis),"rgba(138,144,150,.52)",1);
    }else{
        for(let stage=0;stage<state.step;stage++)
            path(circleInPlane(data.stages[stage].axisWorld),"rgba(138,144,150,.56)",1);
    }

    const currentFixed=state.step>0?data.stages[state.step-1].fixedIndex:null;
    for(let axis=0;axis<3;axis++){
        const v=matrixColumn(data.frames[0],axis);
        const showLabel=state.step===0||!(state.step===1&&axis===currentFixed);
        arrow(v,COLORS.ink,1.55,showLabel?labels[0][axis]:null);
    }

    for(let frame=1;frame<state.step;frame++){
        for(const axis of data.stages[frame-1].moved){
            const v=matrixColumn(data.frames[frame],axis).multiplyScalar(.93);
            segment(O,v,COLORS.grey,1,[5,4]);head(O,v,COLORS.grey,6);
            if(!(frame===state.step-1&&axis===currentFixed))
                text(labels[frame][axis],v.clone().multiplyScalar(1.08),COLORS.grey);
        }
    }

    if(state.step>0){
        const current=data.frames[state.step];
        const colors=[COLORS.x,COLORS.y,COLORS.z];
        for(let axis=0;axis<3;axis++){
            const v=matrixColumn(current,axis);
            arrow(v,colors[axis],2.35,currentFrameLabel(labels,axis),true);
        }
    }

    for(let stage=0;stage<state.step;stage++){
        const rotation=data.stages[stage];
        let labelled=false;
        for(const axis of rotation.moved){
            const points=rotationArcPoints(
                matrixColumn(rotation.start,axis),
                rotation.axisWorld,
                rotation.angle,
                1.06,
                48
            );
            if(!points)continue;
            const color=stageColor(stage);
            path(points,color,1.65);
            head(points.at(-2),points.at(-1),color,6);
            if(!labelled){
                const mid=points[Math.floor(points.length/2)].clone().multiplyScalar(1.14);
                text(activeAngleSymbols()[stage],mid,color,true,[0,-4]);
                labelled=true;
            }
        }
    }

}

function resizeRenderer(){
    const w=Math.max(1,view.clientWidth),h=Math.max(1,view.clientHeight),aspect=w/h;
    renderer.setSize(w,h,false);
    camera.aspect=aspect;
    camera.fov=aspect<1?Math.min(70,45/aspect):45;
    camera.updateProjectionMatrix();
    placeCamera();
}

function resizeProjection(){
    const canvas=projectionCanvas;
    const rect=canvas.getBoundingClientRect();
    const w=Math.max(1,Math.round(rect.width)),h=Math.max(1,Math.round(rect.height));
    if(canvas.width===w&&canvas.height===h)return;
    canvas.width=w;canvas.height=h;
    update();
}

function resizeSpherical(){
    const rect=sphericalCanvas.getBoundingClientRect();
    const w=Math.max(1,Math.round(rect.width)),h=Math.max(1,Math.round(rect.height));
    if(sphericalCanvas.width===w&&sphericalCanvas.height===h)return;
    sphericalCanvas.width=w;sphericalCanvas.height=h;
    update();
}

new ResizeObserver(resizeRenderer).observe(view);
new ResizeObserver(resizeProjection).observe(projectionCanvas);
new ResizeObserver(resizeSpherical).observe(sphericalCanvas);

(function renderLoop(){
    renderer.render(scene,camera);
    requestAnimationFrame(renderLoop);
})();
