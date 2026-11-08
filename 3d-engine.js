/* 3D engine for 3d.html: WebGL renderer, demo catalogue, procedural models and the single-room state store.
   Load before 3d-app.js. */
/* Clinic.exe — small, dependency-free WebGL renderer.
 * All equipment is actual 3D geometry. No images or remote libraries are loaded.
 * Rendering is intentionally separate from catalogue and application state.
 */
(function () {
  'use strict';
  const SHADOW_SIZE=2048;
  const LIGHT=[-8,26,20];  // key light (casts shadows) from the upper front-left, so shadows fall where the default camera can see them
  const V = {
    sub: (a,b) => a.map((v,i)=>v-b[i]),
    add: (a,b) => a.map((v,i)=>v+b[i]),
    scale: (a,s) => a.map(v=>v*s),
    dot: (a,b) => a.reduce((s,v,i)=>s+v*b[i],0),
    cross: (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],
    norm: a => { const l=Math.hypot(...a)||1; return a.map(v=>v/l); }
  };
  const M = {
    identity: () => [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],
    multiply(a,b) { const o=new Array(16).fill(0); for(let c=0;c<4;c++) for(let r=0;r<4;r++) for(let k=0;k<4;k++) o[c*4+r]+=a[k*4+r]*b[c*4+k]; return o; },
    translate(x,y,z) { const m=M.identity(); m[12]=x;m[13]=y;m[14]=z;return m; },
    scale(x,y,z) { const m=M.identity();m[0]=x;m[5]=y;m[10]=z;return m; },
    rx(a) {const c=Math.cos(a),s=Math.sin(a);return [1,0,0,0,0,c,s,0,0,-s,c,0,0,0,0,1];},
    ry(a) {const c=Math.cos(a),s=Math.sin(a);return [c,0,-s,0,0,1,0,0,s,0,c,0,0,0,0,1];},
    rz(a) {const c=Math.cos(a),s=Math.sin(a);return [c,s,0,0,-s,c,0,0,0,0,1,0,0,0,0,1];},
    perspective(fov,aspect,near,far) {const f=1/Math.tan(fov/2),n=1/(near-far);return [f/aspect,0,0,0,0,f,0,0,0,0,(far+near)*n,-1,0,0,2*far*near*n,0];},
    ortho(l,r,b,t,n,f) {return [2/(r-l),0,0,0,0,2/(t-b),0,0,0,0,-2/(f-n),0,-(r+l)/(r-l),-(t+b)/(t-b),-(f+n)/(f-n),1];},
    lookAt(eye,target,up) { const z=V.norm(V.sub(eye,target)),x=V.norm(V.cross(up,z)),y=V.cross(z,x); return [x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-V.dot(x,eye),-V.dot(y,eye),-V.dot(z,eye),1]; },
    transform(m,p) { const q=[...p.slice(0,3),p.length===4?p[3]:1],o=[];for(let r=0;r<4;r++)o[r]=m[r]*q[0]+m[4+r]*q[1]+m[8+r]*q[2]+m[12+r]*q[3];return o; },
    inverse(m) {
      const a=Array.from({length:4},(_,r)=>[m[r],m[4+r],m[8+r],m[12+r],...Array.from({length:4},(_,c)=>r===c?1:0)]);
      for(let i=0;i<4;i++) {let p=i;for(let j=i+1;j<4;j++)if(Math.abs(a[j][i])>Math.abs(a[p][i]))p=j;if(Math.abs(a[p][i])<1e-10)return M.identity();[a[i],a[p]]=[a[p],a[i]];const d=a[i][i];a[i]=a[i].map(v=>v/d);for(let j=0;j<4;j++)if(j!==i){const k=a[j][i];a[j]=a[j].map((v,c)=>v-k*a[i][c]);}}
      return Array.from({length:16},(_,i)=>a[i%4][4+Math.floor(i/4)]);
    },
    normal(m) {const i=M.inverse(m);return [i[0],i[4],i[8],i[1],i[5],i[9],i[2],i[6],i[10]];},
    compose(pos=[0,0,0],size=[1,1,1],rot=[0,0,0]) {let m=M.translate(...pos);m=M.multiply(m,M.ry(rot[1]));m=M.multiply(m,M.rx(rot[0]));m=M.multiply(m,M.rz(rot[2]));return M.multiply(m,M.scale(...size));}
  };
  function hex(s) {return [parseInt(s.slice(1,3),16)/255,parseInt(s.slice(3,5),16)/255,parseInt(s.slice(5,7),16)/255];}
  function boxMesh() {
    const p=[],n=[];
    const faces=[[[1,0,0],[[.5,-.5,-.5],[.5,.5,-.5],[.5,.5,.5],[.5,-.5,.5]]],[[-1,0,0],[[-.5,-.5,.5],[-.5,.5,.5],[-.5,.5,-.5],[-.5,-.5,-.5]]],[[0,1,0],[[-.5,.5,-.5],[-.5,.5,.5],[.5,.5,.5],[.5,.5,-.5]]],[[0,-1,0],[[-.5,-.5,.5],[-.5,-.5,-.5],[.5,-.5,-.5],[.5,-.5,.5]]],[[0,0,1],[[.5,-.5,.5],[.5,.5,.5],[-.5,.5,.5],[-.5,-.5,.5]]],[[0,0,-1],[[-.5,-.5,-.5],[-.5,.5,-.5],[.5,.5,-.5],[.5,-.5,-.5]]]];
    for(const [normal,verts] of faces)for(const i of [0,1,2,0,2,3]){p.push(...verts[i]);n.push(...normal);}return {p,n};
  }
  function cylinderMesh() {
    const p=[],n=[],segments=40;
    for(let i=0;i<segments;i++){const a=i/segments*Math.PI*2,b=(i+1)/segments*Math.PI*2;const va=[Math.cos(a)*.5,Math.sin(a)*.5],vb=[Math.cos(b)*.5,Math.sin(b)*.5];
      const verts=[[va[0],-.5,va[1]],[va[0],.5,va[1]],[vb[0],.5,vb[1]],[vb[0],-.5,vb[1]]];
      for(const j of [0,1,2,0,2,3]){p.push(...verts[j]);const v=j<2?va:vb;n.push(v[0]*2,0,v[1]*2);}
      p.push(0,.5,0,vb[0],.5,vb[1],va[0],.5,va[1]);n.push(0,1,0,0,1,0,0,1,0);
      p.push(0,-.5,0,va[0],-.5,va[1],vb[0],-.5,vb[1]);n.push(0,-1,0,0,-1,0,0,-1,0);
    }return {p,n};
  }
  function material(c){
    const m=c.matrix,half=[0,1,2].map(i=>Math.hypot(m[i*4],m[i*4+1],m[i*4+2])/2),item=!!c.instanceId;
    const [r,g,b]=c.color,sat=Math.max(r,g,b)-Math.min(r,g,b),lum=(r+g+b)/3;
    const spec=!item?[.05,16]:lum<.2?[.35,80]:sat<.09&&lum>.5&&lum<.9?[.55,60]:[.16,28];
    return {half,bevel:item&&(c.shape||'box')==='box'?1:0,ao:item?1:0,spec};
  }
  class Renderer {
    constructor(canvas) {
      this.canvas=canvas;
      const gl=canvas.getContext('webgl',{antialias:true,alpha:true,preserveDrawingBuffer:true});
      if(!gl)return new SoftwareRenderer(canvas);
      this.gl=gl;this.mode='webgl';this.commands=[];this.lines=[];this.room={width:6,depth:5};this.target=[0,.65,0];this.azimuth=.67;this.elevation=.68;this.distance=12;this.showWalls=true;this.showGrid=true;this.shadowDirty=true;this.pending=false;this.onRender=null;
      // Lighting: warm key light (casts the shadows) + cool fill + sky/ground ambient, Blinn-Phong highlights,
      // rounded-edge shading on box parts, soft contact shading near the floor and 5x5 filtered shadows.
      const vertex=`attribute vec3 aPosition;attribute vec3 aNormal;uniform mat4 uModel;uniform mat4 uVP;uniform mat4 uLight;uniform mat3 uNormal;
      varying vec3 vNormal;varying vec3 vLocal;varying vec3 vLocalN;varying vec3 vWorld;varying vec4 vShadow;
      void main(){vec4 world=uModel*vec4(aPosition,1.0);vWorld=world.xyz;vLocal=aPosition;vLocalN=aNormal;vNormal=normalize(uNormal*aNormal);vShadow=uLight*world;gl_Position=uVP*world;}`;
      const frag=`precision highp float;uniform vec3 uColor;uniform sampler2D uShadowMap;uniform float uShadowEnabled;uniform float uUnlit;
      uniform mat3 uNormal;uniform vec3 uHalf;uniform float uBevel;uniform float uAO;uniform vec3 uEye;uniform vec2 uSpec;
      varying vec3 vNormal;varying vec3 vLocal;varying vec3 vLocalN;varying vec3 vWorld;varying vec4 vShadow;
      float unpackDepth(vec4 rgba){return dot(rgba,(255.0/256.0)/vec4(16777216.0,65536.0,256.0,1.0));}
      void main(){
        if(uUnlit>0.5){gl_FragColor=vec4(uColor,1.0);return;}
        vec3 n=normalize(vNormal);
        if(uBevel>0.5){  // round the edges of box parts: bend the normal toward the edge within a small radius (metres)
          vec3 q=vLocal*2.0*uHalf;vec3 d=uHalf-abs(q);
          float r=min(0.02,min(min(uHalf.x,uHalf.y),uHalf.z)*0.7);
          vec3 k=(vec3(1.0)-abs(vLocalN))*clamp(1.0-d/r,0.0,1.0);
          n=normalize(uNormal*((vLocalN+sign(q)*k*0.95)*uHalf));
        }
        vec3 L1=normalize(vec3(${LIGHT.join(',')}));vec3 L2=normalize(vec3(0.75,0.4,0.15));
        float k1=max(dot(n,L1),0.0),k2=max(dot(n,L2),0.0),vis=1.0;
        vec3 p=vShadow.xyz/vShadow.w*0.5+0.5;
        if(uShadowEnabled>0.5&&p.x>0.0&&p.x<1.0&&p.y>0.0&&p.y<1.0&&p.z<1.0){float sum=0.0;float bias=max(0.0004,0.0016*(1.0-k1));
          for(int x=-2;x<=2;x++){for(int y=-2;y<=2;y++){float depth=unpackDepth(texture2D(uShadowMap,p.xy+vec2(float(x),float(y))*(1.2/${SHADOW_SIZE}.0)));sum+=(p.z-bias>depth)?0.0:1.0;}}
          vis=sum/25.0;}
        vec3 ambient=mix(vec3(0.80,0.83,0.88),vec3(1.0,1.0,1.03),n.y*0.5+0.5)*0.64;
        float ao=mix(1.0,mix(0.74,1.0,smoothstep(0.0,0.32,vWorld.y)),uAO);       // contact shading where equipment meets the floor
        vec3 V=normalize(uEye-vWorld);vec3 H=normalize(L1+V);
        float spec=pow(max(dot(n,H),0.0),uSpec.y)*uSpec.x*(0.25+0.75*vis);
        float rim=pow(1.0-max(dot(n,V),0.0),3.0)*0.06*uAO;
        vec3 c=uColor*(ambient*ao*mix(0.9,1.0,vis)+vec3(1.0,0.97,0.92)*0.40*k1*vis+vec3(0.85,0.90,1.0)*0.13*k2)+vec3(spec+rim);
        gl_FragColor=vec4(c,1.0);}`;
      const shadowVert=`attribute vec3 aPosition;uniform mat4 uModel;uniform mat4 uVP;void main(){gl_Position=uVP*uModel*vec4(aPosition,1.0);}`;
      const shadowFrag=`precision highp float;vec4 packDepth(float v){vec4 r=vec4(fract(v*vec3(16777216.0,65536.0,256.0)),v);r.yzw-=r.xyz*(1.0/256.0);return r*(256.0/255.0);}void main(){gl_FragColor=packDepth(gl_FragCoord.z);}`;
      this.program=this.createProgram(vertex,frag);this.shadowProgram=this.createProgram(shadowVert,shadowFrag);
      this.meshes={box:this.upload(boxMesh()),cylinder:this.upload(cylinderMesh())};
      this.lineBuffer=gl.createBuffer();this.normalBuffer=gl.createBuffer();
      this.initShadow();
      gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);
      this.resizeObserver=new ResizeObserver(()=>{this.resize();this.requestRender();});this.resizeObserver.observe(canvas);
      this.resize();
    }
    createProgram(v,f) {const g=this.gl;const compile=(type,src)=>{const s=g.createShader(type);g.shaderSource(s,src);g.compileShader(s);if(!g.getShaderParameter(s,g.COMPILE_STATUS))throw new Error(g.getShaderInfoLog(s));return s;};const p=g.createProgram();g.attachShader(p,compile(g.VERTEX_SHADER,v));g.attachShader(p,compile(g.FRAGMENT_SHADER,f));g.linkProgram(p);if(!g.getProgramParameter(p,g.LINK_STATUS))throw new Error(g.getProgramInfoLog(p));const uniforms={};for(const n of ['uModel','uVP','uLight','uNormal','uColor','uShadowMap','uShadowEnabled','uUnlit','uHalf','uBevel','uAO','uEye','uSpec'])uniforms[n]=g.getUniformLocation(p,n);return {p,uniforms,pos:g.getAttribLocation(p,'aPosition'),normal:g.getAttribLocation(p,'aNormal')};}
    upload(mesh) {const g=this.gl;const upload=(a)=>{const b=g.createBuffer();g.bindBuffer(g.ARRAY_BUFFER,b);g.bufferData(g.ARRAY_BUFFER,new Float32Array(a),g.STATIC_DRAW);return b;};return {p:upload(mesh.p),n:upload(mesh.n),count:mesh.p.length/3};}
    initShadow() {const g=this.gl;this.shadowTex=g.createTexture();g.bindTexture(g.TEXTURE_2D,this.shadowTex);g.texImage2D(g.TEXTURE_2D,0,g.RGBA,SHADOW_SIZE,SHADOW_SIZE,0,g.RGBA,g.UNSIGNED_BYTE,null);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MIN_FILTER,g.NEAREST);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MAG_FILTER,g.NEAREST);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_S,g.CLAMP_TO_EDGE);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_T,g.CLAMP_TO_EDGE);this.shadowFB=g.createFramebuffer();g.bindFramebuffer(g.FRAMEBUFFER,this.shadowFB);g.framebufferTexture2D(g.FRAMEBUFFER,g.COLOR_ATTACHMENT0,g.TEXTURE_2D,this.shadowTex,0);const rb=g.createRenderbuffer();g.bindRenderbuffer(g.RENDERBUFFER,rb);g.renderbufferStorage(g.RENDERBUFFER,g.DEPTH_COMPONENT16,SHADOW_SIZE,SHADOW_SIZE);g.framebufferRenderbuffer(g.FRAMEBUFFER,g.DEPTH_ATTACHMENT,g.RENDERBUFFER,rb);this.shadows=g.checkFramebufferStatus(g.FRAMEBUFFER)===g.FRAMEBUFFER_COMPLETE;g.bindFramebuffer(g.FRAMEBUFFER,null);}
    resize(){const d=Math.min(window.devicePixelRatio||1,2),w=Math.max(1,Math.round(this.canvas.clientWidth*d)),h=Math.max(1,Math.round(this.canvas.clientHeight*d));if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;}this.updateMatrices();}
    updateMatrices() {const r=this.distance,el=this.elevation,az=this.azimuth;this.eye=V.add(this.target,[r*Math.cos(el)*Math.sin(az),r*Math.sin(el),r*Math.cos(el)*Math.cos(az)]);this.view=M.lookAt(this.eye,this.target,[0,1,0]);this.projection=M.perspective(Math.PI/4,this.canvas.width/this.canvas.height,.05,200);this.vp=M.multiply(this.projection,this.view);this.inverseVP=M.inverse(this.vp);const ext=Math.max(this.room.width,this.room.depth)*.83+3;this.lightVP=M.multiply(M.ortho(-ext,ext,-ext,ext,1,65),M.lookAt(LIGHT,[0,0,0],[0,1,0]));}
    home(top=false,animate=false) {const radius=Math.hypot(this.room.width,this.room.depth)/2;const aspect=this.canvas.clientWidth/Math.max(1,this.canvas.clientHeight);
      const goal={target:[0,top?0:.6,0],azimuth:top?0:.67,elevation:top?Math.PI/2-.002:.68,distance:radius/.383*Math.max(1,1/aspect)*1.02};
      this.stopCamera();if(animate){this.fly=goal;this.startCamera();return;}
      this.target=goal.target;this.azimuth=goal.azimuth;this.elevation=goal.elevation;this.distance=goal.distance;this.requestRender();}
    /* Camera damping (inertia). Input adds to a velocity; every frame applies ~10% of what is left and the rest
       carries over, so the camera eases after the pointer and glides to a stop when you let go.
       flyTo-style easing (this.fly) moves smoothly to a saved view for the 3D / Top / Fit buttons. */
    camVel(){return this.vel||(this.vel={az:0,el:0,zoom:0,x:0,z:0});}
    orbitBy(dAz,dEl){const v=this.camVel();v.az+=dAz;v.el+=dEl;this.fly=null;this.startCamera();}
    zoomBy(d){this.camVel().zoom+=d;this.fly=null;this.startCamera();}
    panBy(dx,dz){const v=this.camVel();v.x+=dx;v.z+=dz;this.fly=null;this.startCamera();}
    stopCamera(){const v=this.camVel();for(const k in v)v[k]=0;this.fly=null;}
    startCamera(){if(this.camFrame)return;let last=performance.now();const step=now=>{const moving=this.stepCamera(Math.min(64,now-last));last=now;this.render();this.camFrame=moving?requestAnimationFrame(step):0;};this.camFrame=requestAnimationFrame(step);}
    stepCamera(dt){
      const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches,f=reduce?1:1-Math.pow(.9,dt/16.67),v=this.camVel(),maxEl=Math.PI/2-.002;
      this.azimuth+=v.az*f;this.elevation=Math.max(.15,Math.min(maxEl,this.elevation+v.el*f));this.distance=Math.max(3,Math.min(60,this.distance*Math.exp(v.zoom*f)));
      this.target[0]=Math.max(-12,Math.min(12,this.target[0]+v.x*f));this.target[2]=Math.max(-12,Math.min(12,this.target[2]+v.z*f));
      for(const k in v)v[k]*=1-f;
      const g=this.fly;
      if(g){const e=reduce?1:1-Math.pow(.86,dt/16.67);let da=g.azimuth-this.azimuth;da=Math.atan2(Math.sin(da),Math.cos(da));
        this.azimuth+=da*e;this.elevation+=(g.elevation-this.elevation)*e;this.distance+=(g.distance-this.distance)*e;for(let i=0;i<3;i++)this.target[i]+=(g.target[i]-this.target[i])*e;
        if(Math.abs(da)<5e-4&&Math.abs(g.elevation-this.elevation)<5e-4&&Math.abs(g.distance-this.distance)<5e-4*g.distance&&g.target.every((t,i)=>Math.abs(t-this.target[i])<5e-4)){
          this.azimuth=g.azimuth;this.elevation=g.elevation;this.distance=g.distance;this.target=[...g.target];this.fly=null;}}
      return !!this.fly||Object.values(v).some(x=>Math.abs(x)>1e-4);
    }
    requestRender() {if(!this.pending){this.pending=true;requestAnimationFrame(()=>{this.pending=false;this.render();});}}
    setScene(commands,lines,room) {this.commands=commands;this.lines=lines;this.room=room;this.shadowDirty=true;this.requestRender();}
    wallVisible(command) {if(!command.wall)return true;if(!this.showWalls||this.elevation>1.42)return false;return command.wall==='back'?this.eye[2]>0:this.eye[0]>0;}
    draw(c,p,shadow=false) {const g=this.gl,mesh=this.meshes[c.shape||'box'];g.bindBuffer(g.ARRAY_BUFFER,mesh.p);g.vertexAttribPointer(p.pos,3,g.FLOAT,false,0,0);g.enableVertexAttribArray(p.pos);g.uniformMatrix4fv(p.uniforms.uModel,false,c.matrix);if(!shadow){g.bindBuffer(g.ARRAY_BUFFER,mesh.n);g.vertexAttribPointer(p.normal,3,g.FLOAT,false,0,0);g.enableVertexAttribArray(p.normal);g.uniformMatrix3fv(p.uniforms.uNormal,false,c.normal||(c.normal=M.normal(c.matrix)));g.uniform3fv(p.uniforms.uColor,c.color);g.uniform1f(p.uniforms.uUnlit,c.unlit?1:0);const m=c.material||(c.material=material(c));g.uniform3fv(p.uniforms.uHalf,m.half);g.uniform1f(p.uniforms.uBevel,m.bevel);g.uniform1f(p.uniforms.uAO,m.ao);g.uniform2fv(p.uniforms.uSpec,m.spec);}g.drawArrays(g.TRIANGLES,0,mesh.count);}
    render(){const g=this.gl;this.updateMatrices();const visible=this.commands.filter(c=>this.wallVisible(c));const wallKey=visible.filter(c=>c.wall).map(c=>c.wall).join();if(wallKey!==this.wallKey){this.shadowDirty=true;this.wallKey=wallKey;}
      if(this.shadowDirty&&this.shadows){g.bindFramebuffer(g.FRAMEBUFFER,this.shadowFB);g.viewport(0,0,SHADOW_SIZE,SHADOW_SIZE);g.clearColor(1,1,1,1);g.clear(g.COLOR_BUFFER_BIT|g.DEPTH_BUFFER_BIT);g.useProgram(this.shadowProgram.p);g.uniformMatrix4fv(this.shadowProgram.uniforms.uVP,false,this.lightVP);for(const c of visible)if(!c.noShadow)this.draw(c,this.shadowProgram,true);g.bindFramebuffer(g.FRAMEBUFFER,null);this.shadowDirty=false;}
      g.viewport(0,0,this.canvas.width,this.canvas.height);g.clearColor(0,0,0,0);g.clear(g.COLOR_BUFFER_BIT|g.DEPTH_BUFFER_BIT);g.useProgram(this.program.p);const u=this.program.uniforms;g.uniformMatrix4fv(u.uVP,false,this.vp);g.uniformMatrix4fv(u.uLight,false,this.lightVP);g.uniform3fv(u.uEye,this.eye);g.uniform1f(u.uShadowEnabled,this.shadows?1:0);g.activeTexture(g.TEXTURE0);g.bindTexture(g.TEXTURE_2D,this.shadowTex);g.uniform1i(u.uShadowMap,0);for(const c of visible)this.draw(c,this.program);
      for(const line of this.lines){if(line.grid&&!this.showGrid)continue;g.bindBuffer(g.ARRAY_BUFFER,this.lineBuffer);g.bufferData(g.ARRAY_BUFFER,new Float32Array(line.points),g.DYNAMIC_DRAW);g.vertexAttribPointer(this.program.pos,3,g.FLOAT,false,0,0);g.enableVertexAttribArray(this.program.pos);g.disableVertexAttribArray(this.program.normal);g.vertexAttrib3f(this.program.normal,0,1,0);g.uniformMatrix4fv(u.uModel,false,M.identity());g.uniformMatrix3fv(u.uNormal,false,[1,0,0,0,1,0,0,0,1]);g.uniform3fv(u.uColor,line.color);g.uniform1f(u.uUnlit,1);g.drawArrays(g.LINES,0,line.points.length/3);}
      this.onRender?.();
    }
    ray(clientX,clientY){this.updateMatrices();const rect=this.canvas.getBoundingClientRect(),x=(clientX-rect.left)/rect.width*2-1,y=1-(clientY-rect.top)/rect.height*2;const unproject=z=>{const p=M.transform(this.inverseVP,[x,y,z,1]);return p.slice(0,3).map(v=>v/p[3]);};const start=unproject(-1),end=unproject(1);return {start,direction:V.norm(V.sub(end,start))};}
    floorPoint(clientX,clientY){const ray=this.ray(clientX,clientY);if(Math.abs(ray.direction[1])<1e-6)return null;const t=-ray.start[1]/ray.direction[1];return t>0?V.add(ray.start,V.scale(ray.direction,t)):null;}
    project(p){this.updateMatrices();const q=M.transform(this.vp,p),r=this.canvas.getBoundingClientRect();return {x:r.left+(q[0]/q[3]+1)*r.width/2,y:r.top+(1-q[1]/q[3])*r.height/2,visible:q[3]>0};}
    pick(clientX,clientY,instances,catalogue){const ray=this.ray(clientX,clientY);let best=null,distance=Infinity;for(const item of instances){const def=catalogue.find(d=>d.id===item.productId),rot=M.ry(-item.rotation*Math.PI/180);const origin=M.transform(rot,[ray.start[0]-item.x,ray.start[1],ray.start[2]-item.z,1]);const direction=M.transform(rot,[...ray.direction,0]);const min=[-def.width/2,0,-def.depth/2],max=[def.width/2,def.height,def.depth/2];let near=0,far=Infinity;for(let a=0;a<3;a++){if(Math.abs(direction[a])<1e-7){if(origin[a]<min[a]||origin[a]>max[a]){near=Infinity;break;}}else{let t1=(min[a]-origin[a])/direction[a],t2=(max[a]-origin[a])/direction[a];if(t1>t2)[t1,t2]=[t2,t1];near=Math.max(near,t1);far=Math.min(far,t2);}}if(near<=far&&near<distance){best=item;distance=near;}}return best;}
  }

  /* Software fallback with a real depth buffer. It renders the same triangles
   * and perspective camera as WebGL, so overlapping geometry is correctly hidden.
   */
  class SoftwareRenderer {
    constructor(canvas) {
      this.canvas=canvas;this.ctx=canvas.getContext('2d');
      if(!this.ctx)throw new Error('Neither WebGL nor Canvas is available in this browser.');
      this.mode='software';this.gl=null;this.commands=[];this.lines=[];this.room={width:6,depth:5};this.target=[0,.65,0];this.azimuth=.67;this.elevation=.68;this.distance=12;this.showWalls=true;this.showGrid=true;this.pending=false;this.onRender=null;
      this.meshes={box:boxMesh(),cylinder:cylinderMesh()};this.triangles=[];
      this.resizeObserver=new ResizeObserver(()=>{this.resize();this.requestRender();});this.resizeObserver.observe(canvas);this.resize();
    }
    setScene(commands,lines,room) {
      this.commands=commands;this.lines=lines;this.room=room;this.triangles=[];
      for(const command of commands) {
        const mesh=this.meshes[command.shape||'box'],normalMatrix=M.normal(command.matrix);
        const normal=p=>V.norm([normalMatrix[0]*p[0]+normalMatrix[3]*p[1]+normalMatrix[6]*p[2],normalMatrix[1]*p[0]+normalMatrix[4]*p[1]+normalMatrix[7]*p[2],normalMatrix[2]*p[0]+normalMatrix[5]*p[1]+normalMatrix[8]*p[2]]);
        for(let i=0;i<mesh.p.length;i+=9) {
          const vertices=[0,3,6].map(o=>M.transform(command.matrix,mesh.p.slice(i+o,i+o+3)).slice(0,3));
          const n=normal(mesh.n.slice(i,i+3));const center=[0,1,2].map(axis=>vertices.reduce((s,p)=>s+p[axis],0)/3);
          const diffuse=Math.max(0,V.dot(n,V.norm([.45,.9,.55]))),shade=command.unlit?1:.78+.08*n[1]+.19*diffuse;
          const color=command.color.map(v=>Math.min(255,Math.round(v*255*shade)));
          this.triangles.push({vertices,normal:n,center,color,command});
        }
      }
      this.requestRender();
    }
    render() {
      this.updateMatrices();const ctx=this.ctx,W=this.canvas.width,H=this.canvas.height;
      if(!this.image||this.image.width!==W||this.image.height!==H){this.image=ctx.createImageData(W,H);this.zbuffer=new Float32Array(W*H);this.pixels32=new Uint32Array(this.image.data.buffer);}
      const pixels=this.image.data,packed=this.pixels32,zbuffer=this.zbuffer;packed.fill(0);zbuffer.fill(Infinity);
      const projection=p=>{const q=M.transform(this.vp,p);return {x:(q[0]/q[3]+1)*W/2,y:(1-q[1]/q[3])*H/2,z:q[2]/q[3],w:q[3]};};
      const raster=(a,b,c,color,alpha=1)=>{
        if(a.w<=.05||b.w<=.05||c.w<=.05)return;
        const area=(b.y-c.y)*(a.x-c.x)+(c.x-b.x)*(a.y-c.y);if(Math.abs(area)<.00001)return;
        const x0=Math.max(0,Math.floor(Math.min(a.x,b.x,c.x))),x1=Math.min(W-1,Math.ceil(Math.max(a.x,b.x,c.x))),y0=Math.max(0,Math.floor(Math.min(a.y,b.y,c.y))),y1=Math.min(H-1,Math.ceil(Math.max(a.y,b.y,c.y)));
        const A0=(b.y-c.y)/area,B0=(c.x-b.x)/area,C0=(b.x*c.y-c.x*b.y)/area,A1=(c.y-a.y)/area,B1=(a.x-c.x)/area,C1=(c.x*a.y-a.x*c.y)/area;
        const zA=a.z-c.z,zB=b.z-c.z,packedColor=(255<<24)|(color[2]<<16)|(color[1]<<8)|color[0];
        for(let y=y0;y<=y1;y++){
          let w0=A0*(x0+.5)+B0*(y+.5)+C0,w1=A1*(x0+.5)+B1*(y+.5)+C1;
          for(let x=x0;x<=x1;x++,w0+=A0,w1+=A1){if(w0<-.000001||w1<-.000001||w0+w1>1.000001)continue;const z=c.z+w0*zA+w1*zB,index=y*W+x;if(z>=zbuffer[index]+.0000001)continue;
            if(alpha===1){zbuffer[index]=z;packed[index]=packedColor;}else{const offset=index*4;pixels[offset]=pixels[offset]*(1-alpha)+color[0]*alpha;pixels[offset+1]=pixels[offset+1]*(1-alpha)+color[1]*alpha;pixels[offset+2]=pixels[offset+2]*(1-alpha)+color[2]*alpha;pixels[offset+3]=255;}
          }
        }
      };
      for(const tri of this.triangles){if(!this.wallVisible(tri.command)||V.dot(tri.normal,V.sub(this.eye,tri.center))<=0)continue;const p=tri.vertices.map(projection);raster(p[0],p[1],p[2],tri.color);}
      const seen=new Set();
      for(const c of this.commands)if(c.instanceId&&!seen.has(c.instanceId)){
        seen.add(c.instanceId);const angle=c.rotation*Math.PI/180,co=Math.cos(angle),si=Math.sin(angle),center=projection([c.origin[0],.012,c.origin[1]]);
        for(const scale of [1.14,.94,.74]){const points=[];for(let j=0;j<28;j++){const a=j/28*Math.PI*2,xx=Math.cos(a)*c.footprint[0]*.54*scale,zz=Math.sin(a)*c.footprint[1]*.54*scale;points.push(projection([c.origin[0]+xx*co+zz*si,.012,c.origin[1]-xx*si+zz*co]));}for(let j=0;j<28;j++)raster(center,points[j],points[(j+1)%28],[54,79,108],.055);}
      }
      for(const line of this.lines){if(line.grid&&!this.showGrid)continue;const col=line.color.map(v=>Math.round(v*255)),value=(255<<24)|(col[2]<<16)|(col[1]<<8)|col[0];for(let i=0;i<line.points.length;i+=6){const a=projection(line.points.slice(i,i+3)),b=projection(line.points.slice(i+3,i+6));if(a.w<=0||b.w<=0)continue;const steps=Math.ceil(Math.max(Math.abs(b.x-a.x),Math.abs(b.y-a.y)));for(let j=0;j<=steps;j++){const t=j/(steps||1),x=Math.round(a.x+(b.x-a.x)*t),y=Math.round(a.y+(b.y-a.y)*t),z=a.z+(b.z-a.z)*t-.00001;if(x<0||x>=W||y<0||y>=H)continue;const index=y*W+x;if(z<zbuffer[index])packed[index]=value;}}}
      ctx.putImageData(this.image,0,0);this.onRender?.();
    }
  }
  for(const key of ['resize','updateMatrices','home','requestRender','wallVisible','ray','floorPoint','project','pick','camVel','orbitBy','zoomBy','panBy','stopCamera','startCamera','stepCamera'])SoftwareRenderer.prototype[key]=Renderer.prototype[key];
  window.Clinic3D={Renderer,SoftwareRenderer,M,V,hex};
})();


/* Demo catalogue: replace identifiers and verify dimensions before real use.
 * Dimensions are illustrative metres, not manufacturer specifications.
 * Prices are intentionally absent: final quotations belong to the sales team.
 */
(function () {
  'use strict';
  const catalogue = [
    {id:'exam-table',name:'Examination table',category:'General examination',width:2.05,depth:.85,height:1.03,color:'#4f8edb',icon:'table',preferred:[-1.35,.15]},
    {id:'exam-chair',name:'Examination chair',category:'Optometry',width:.98,depth:1.40,height:1.62,color:'#5c9bab',icon:'chair',preferred:[-1.25,.05]},
    {id:'slit-lamp',name:'Slit lamp station',category:'Optometry',width:1.02,depth:.78,height:1.58,color:'#7a8cbb',icon:'lamp',preferred:[1.15,-.65]},
    {id:'stool',name:'Clinician stool',category:'Seating',width:.62,depth:.62,height:.68,color:'#6b9bc8',icon:'stool',preferred:[.8,.95]},
    {id:'cabinet',name:'Storage cabinet',category:'Storage',width:1.2,depth:.58,height:1.8,color:'#ac9c84',icon:'cabinet',preferred:[-1.8,-1.95]},
    {id:'monitor',name:'Monitor cart',category:'Monitoring',width:.66,depth:.66,height:1.6,color:'#738ca9',icon:'monitor',preferred:[2,1.25]},

    // EXAMPLE ONLY. Replace these records with verified catalogue products.
    // Keep each real product ID separate, even when they share a modelType.
    {
      id: 'demo-chair-001',
      name: 'Custom examination chair (example)',
      category: 'Optometry',
      modelType: 'exam-chair',
      width: 1.0,
      depth: 1.4,
      height: 1.6,
      color: '#537ec1',
      icon: 'chair',
      preferred: [0, 0]
    },
    {
      id: 'demo-cart-001',
      name: 'Custom equipment cart (box example)',
      category: 'Other equipment',
      modelType: 'box',
      width: 0.8,
      depth: 0.6,
      height: 0.9,
      color: '#c19153',
      icon: 'cabinet',
      preferred: [1.5, 0]
    },
    // Valuemed products from clinic.html's catalogue.js (3D id = "vm-" + its id). Each has its own model below.
    // Sizes are approximate envelopes in metres, not manufacturer specifications.
    {id:'vm-19',name:'Flight Saddle Stool with Backrest',category:'Seating',modelType:'saddle-stool-back',width:.58,depth:.58,height:.90,color:'#3a4250',icon:'stool',preferred:[.8,.95]},
    {id:'vm-20',name:'Flight Deluxe Assistant Stool',category:'Seating',modelType:'assistant-stool',width:.62,depth:.62,height:1.05,color:'#7a4b8c',icon:'stool',preferred:[1.5,.95]},
    {id:'vm-28',name:'Flight Saddle Stool',category:'Seating',modelType:'saddle-stool',width:.56,depth:.56,height:.68,color:'#2b313b',icon:'stool',preferred:[.1,.95]},
    {id:'vm-55',name:'Welch Allyn ECG Office Cart',category:'Cardiology',modelType:'ecg-cart',width:.60,depth:.52,height:1.05,color:'#3c6fb4',icon:'monitor',preferred:[2,1.25]},
    {id:'vm-59',name:'Prime Care Bed P503',category:'Patient care',modelType:'care-bed',width:2.15,depth:1.0,height:1.0,color:'#4f8edb',icon:'table',preferred:[-1.2,.1]},
    {id:'vm-60',name:'AseptiChair Portable Dental Chair',category:'Dental',modelType:'dental-chair',width:.80,depth:1.75,height:1.05,color:'#2f6fb5',icon:'chair',preferred:[-1.2,.1]},
    {id:'vm-61',name:'Flight Doctors Stool',category:'Seating',modelType:'doctor-stool',width:.56,depth:.56,height:.86,color:'#2f6fa8',icon:'stool',preferred:[.8,.3]},
    {id:'vm-62',name:'Kik-Step Stool',category:'Patient room',modelType:'step-stool',width:.40,depth:.40,height:.43,color:'#5d7896',icon:'stool',preferred:[-.3,1.1]},
    {id:'vm-63',name:'Solic Crash Cart',category:'Emergency',modelType:'crash-cart',width:.70,depth:.55,height:1.25,color:'#c8463d',icon:'cabinet',preferred:[-1.8,-1.95]},
    {id:'vm-64',name:'Stainless Steel Cart',category:'Carts',modelType:'steel-cart',width:.66,depth:.47,height:1.0,color:'#b9c4ce',icon:'cabinet',preferred:[1.6,-1.95]},
    {id:'vm-65',name:'Medical Utility Cart',category:'Carts',modelType:'utility-cart',width:.76,depth:.46,height:.95,color:'#4f8edb',icon:'cabinet',preferred:[.5,-1.95]},
    {id:'vm-66',name:'Edan iM3 Vital Signs Monitor',category:'Monitoring',modelType:'vitals-stand',width:.55,depth:.55,height:1.25,color:'#2d8a7a',icon:'monitor',preferred:[2,.4]}
  ];
  // Validate hand-edited data before any UI or geometry is created.
  const seen = new Set();
  for (const product of catalogue) {
    if (!/^[A-Za-z0-9_-]+$/.test(product.id) || seen.has(product.id)) {
      throw new Error('Use a unique catalogue ID containing only letters, numbers, hyphens or underscores.');
    }
    seen.add(product.id);
    if (typeof product.name !== 'string' || !product.name.trim()) {
      throw new Error('Catalogue product names must be nonempty strings.');
    }
    for (const axis of ['width', 'depth', 'height']) {
      if (!Number.isFinite(product[axis]) || product[axis] <= 0) {
        throw new Error(product.id + ': ' + axis + ' must be a positive number in metres.');
      }
    }
    if (!/^#[0-9a-fA-F]{6}$/.test(product.color || '')) product.color = '#738ca9';
    if (!Array.isArray(product.preferred) || product.preferred.length !== 2 || !product.preferred.every(Number.isFinite)) product.preferred = [0, 0];
  }
  const presets = {
    general: {name:'General examination',items:[{productId:'exam-table',quantity:1},{productId:'stool',quantity:1},{productId:'cabinet',quantity:1},{productId:'monitor',quantity:1}]},
    optometry: {name:'Optometry — two-item demo',items:[{productId:'exam-chair',quantity:1},{productId:'slit-lamp',quantity:1}]},
    empty: {name:'Empty room',items:[]}
  };
  const aliases={'exam_table':'exam-table','examination-table':'exam-table','exam_chair':'exam-chair','examination-chair':'exam-chair','slit_lamp':'slit-lamp'};
  window.ClinicData={catalogue,presets,aliases};
})();


/* Procedural 3D equipment built from boxes and cylinders.
 * Model parts use local coordinates; an instance supplies its group transform.
 */
(function () {
  'use strict';
  const {M,hex}=window.Clinic3D;
  const white='#f3f6f8',metal='#a2b2bf',dark='#3e5267',blue='#659bd1',teal='#6fa9b3';
  function model(id) {
    const definition = window.ClinicData.catalogue.find(product => product.id === id);
    if (!definition) throw new Error('No catalogue definition for: ' + id);
    const type = definition.modelType || id;
    const accent = definition.color || blue;
    const parts=[];
    const add=(shape,x,y,z,w,h,d,color,rx=0,ry=0,rz=0)=>parts.push({shape,matrix:M.compose([x,y,z],[w,h,d],[rx,ry,rz]),color:hex(color)});
    const b=(x,y,z,w,h,d,color,rx=0,ry=0,rz=0)=>add('box',x,y,z,w,h,d,color,rx,ry,rz);
    const c=(x,y,z,w,h,d,color,rx=0,ry=0,rz=0)=>add('cylinder',x,y,z,w,h,d,color,rx,ry,rz);
    const star=(R,col=metal)=>{for(let i=0;i<5;i++){const a=i*Math.PI*2/5;b(Math.sin(a)*R/2,.08,Math.cos(a)*R/2,.05,.04,R,col,0,a);c(Math.sin(a)*R,.04,Math.cos(a)*R,.075,.075,.075,dark);}c(0,.09,0,.11,.08,.11,dark);};
    if(type==='exam-table') {
      b(0,.12,0,1.62,.16,.58,dark);b(0,.44,0,1.64,.53,.64,white);b(0,.71,0,1.92,.07,.77,metal);
      b(.21,.83,0,1.57,.18,.82,accent);b(-.78,.90,0,.49,.17,.82,accent,0,0,-.20);b(-.80,1.00,0,.31,.06,.53,'#dbe9f7',0,0,-.20);
      for(const y of [.29,.46,.63]){b(.23,y,.327,.92,.014,.008,'#bdcbd5');b(.23,y+.06,.342,.25,.025,.027,metal);}
      b(-.54,.43,.33,.012,.46,.012,'#bdcbd5');b(-.64,.56,.35,.025,.15,.024,metal);
      b(.90,.36,0,.15,.05,.53,metal);
    } else if(type==='exam-chair') {
      c(0,.06,0,.86,.12,.86,dark);c(0,.34,0,.18,.48,.18,metal);b(0,.62,0,.62,.13,.61,white);
      b(0,.74,.09,.72,.17,.70,accent);b(0,1.10,-.28,.72,.70,.16,accent,-.14);b(0,1.50,-.34,.44,.23,.15,accent,-.14);
      for(const x of [-.425,.425]){b(x,.81,.10,.055,.32,.055,metal);b(x,.96,.05,.12,.10,.64,dark);}
      b(0,.54,.48,.55,.12,.45,white,.4);b(0,.39,.60,.58,.08,.23,dark,.22);
    } else if(type==='slit-lamp') {
      c(0,.05,0,.70,.10,.63,dark);c(0,.39,0,.13,.67,.13,metal);b(0,.80,0,1.02,.09,.72,white);
      b(-.12,.88,.05,.43,.08,.31,metal);c(-.10,1.08,.03,.10,.34,.10,white);b(-.10,1.27,.03,.18,.25,.19,white);
      for(const x of [-.17,-.03]){c(x,1.29,.19,.095,.22,.095,dark,Math.PI/2);c(x,1.29,.31,.11,.05,.11,'#394a62',Math.PI/2);}
      c(.17,1.17,-.13,.065,.56,.065,metal);b(.17,1.47,-.13,.16,.14,.19,dark);
      for(const x of [-.34,.34])c(x,1.16,-.25,.035,.65,.035,metal);
      b(0,1.47,-.25,.70,.055,.085,white);b(0,1.03,-.25,.23,.065,.15,accent);c(-.32,.94,.20,.055,.11,.055,dark);
    } else if(type==='stool') {
      c(0,.62,0,.43,.12,.43,accent);c(0,.34,0,.065,.46,.065,metal);c(0,.095,0,.12,.11,.12,dark);
      for(let i=0;i<5;i++){const a=i*Math.PI*2/5;b(Math.sin(a)*.12,.08,Math.cos(a)*.12,.055,.045,.28,metal,0,a);c(Math.sin(a)*.255,.045,Math.cos(a)*.255,.08,.08,.08,dark);}
    } else if(type==='cabinet') {
      b(0,.08,0,1.12,.16,.49,dark);b(0,.51,0,1.20,.76,.54,white);b(0,.91,0,1.22,.06,.58,'#bfae91');
      b(0,1.40,-.06,1.16,.79,.43,white);b(-.29,1.43,.162,.51,.66,.02,'#bdcdd7');b(.29,1.43,.162,.51,.66,.02,'#bdcdd7');
      for(const x of [-.06,.06])b(x,1.42,.185,.025,.20,.025,metal);
      for(const y of [.30,.55,.78]){b(0,y,.276,1.12,.011,.012,'#c0cdd6');b(0,y+.06,.295,.28,.022,.03,metal);}
    } else if(type==='monitor') {
      for(const x of [-.23,.23])for(const z of [-.23,.23])c(x,.06,z,.09,.12,.09,dark);
      b(0,.18,0,.62,.10,.56,white);c(0,.70,0,.07,1.04,.07,metal);b(0,.75,0,.52,.06,.45,white);
      b(0,1.30,0,.60,.43,.10,dark);b(0,1.31,.058,.53,.34,.015,'#152e47');b(0,1.04,.07,.39,.06,.30,metal);
      b(-.08,1.37,.069,.30,.009,.006,'#7ce3cc');b(-.09,1.29,.069,.28,.009,.006,'#80c7ee');
      b(.18,1.39,.069,.06,.028,.008,'#7ce3cc');b(.18,1.29,.069,.06,.028,.008,'#80c7ee');
      b(-.12,1.39,.071,.008,.06,.008,'#7ce3cc');b(-.105,1.34,.071,.008,.05,.008,'#7ce3cc');
    } else if(type==='saddle-stool'||type==='saddle-stool-back') {
      const back=type==='saddle-stool-back',chrome='#c5ced6';
      star(.27,back?dark:chrome);c(0,.33,0,.07,.42,.07,back?dark:metal);c(0,.53,0,.10,.06,.10,dark);b(0,.585,0,.22,.05,.22,dark);
      b(-.12,.63,-.01,.20,.07,.36,accent,0,0,.24);b(.12,.63,-.01,.20,.07,.36,accent,0,0,-.24);   // saddle wings slope down to the sides
      b(0,.625,-.02,.12,.06,.38,accent);b(0,.655,.16,.10,.06,.11,accent,.3);b(0,.665,-.17,.30,.06,.10,accent,-.25); // horn + raised rear
      if(back){b(0,.70,-.21,.05,.24,.04,metal);b(0,.80,-.235,.34,.15,.06,accent,-.12);b(-.17,.80,-.205,.07,.14,.06,accent,0,.55);b(.17,.80,-.205,.07,.14,.06,accent,0,-.55);}
    } else if(type==='assistant-stool') {
      star(.29);c(0,.40,0,.07,.60,.07,metal);c(0,.71,0,.13,.06,.13,dark);c(0,.77,0,.44,.09,.44,accent);c(0,.82,0,.40,.02,.40,'#8d5ea0');
      for(let i=0;i<12;i++){const a=i*Math.PI/6;b(Math.sin(a)*.21,.40,Math.cos(a)*.21,.03,.03,.12,'#c5ced6',0,a+Math.PI/2);} // foot ring
      for(const a of [0,2.09,4.19])b(Math.sin(a)*.105,.40,Math.cos(a)*.105,.025,.025,.21,metal,0,a);
      b(.23,.92,-.04,.04,.26,.04,metal);b(.14,1.03,.07,.26,.04,.04,metal,0,.75);b(-.01,1.03,.15,.28,.10,.07,accent,0,-.2); // body-support arm
    } else if(type==='doctor-stool') {
      star(.28);c(0,.36,0,.07,.46,.07,metal);c(0,.60,0,.12,.06,.12,dark);
      c(0,.67,0,.48,.10,.48,accent);c(0,.725,0,.42,.02,.42,'#4a8cc4');b(.20,.57,.05,.10,.015,.03,dark); // thick round seat + height lever
      b(0,.66,-.22,.20,.03,.06,metal);b(0,.72,-.25,.04,.14,.03,metal);b(0,.80,-.26,.32,.12,.05,accent,-.1); // bracket + backrest
    } else if(type==='step-stool') {
      c(0,.03,0,.40,.06,.40,'#2d3743');c(0,.13,0,.38,.16,.38,accent);c(0,.27,0,.34,.14,.34,accent);c(0,.365,0,.30,.07,.30,accent);c(0,.415,0,.29,.03,.29,'#2d3743');
      for(let i=0;i<4;i++){const a=i*Math.PI/2+.4;b(Math.sin(a)*.18,.18,Math.cos(a)*.18,.06,.08,.02,'#3e4d5e',0,a);}
    } else if(type==='ecg-cart') {
      for(const x of [-.24,.24])for(const z of [-.20,.20])c(x,.045,z,.08,.09,.08,dark);
      b(0,.12,0,.58,.06,.50,white);b(0,.45,-.12,.16,.66,.12,'#d9e1e8');b(0,.70,.05,.50,.12,.40,'#e9eef2');
      b(0,.70,.255,.44,.09,.01,'#c3ced8');b(0,.70,.265,.14,.02,.02,metal);b(0,.80,0,.60,.05,.52,white);b(0,.80,.262,.60,.05,.006,accent);
      b(-.05,.85,.02,.38,.06,.28,'#f4f6f8');b(-.05,.97,-.10,.34,.20,.02,dark,-.35);b(-.05,.97,-.088,.30,.16,.005,'#1d3a58',-.35);
      b(-.13,.975,-.083,.12,.006,.004,'#7ce3cc',-.35);b(.02,.955,-.083,.12,.006,.004,'#80c7ee',-.35);b(-.05,.885,.15,.20,.01,.06,'#ffffff');
      b(0,.95,-.27,.46,.03,.03,metal);for(const x of [-.22,.22])b(x,.88,-.27,.03,.14,.03,metal);c(.25,.95,-.15,.025,.30,.025,metal);
    } else if(type==='vitals-stand') {
      star(.27,dark);c(0,.62,0,.045,1.0,.045,metal);b(0,.82,.07,.26,.10,.16,'#c9d3dc');b(0,.88,.07,.26,.02,.16,'#b5c1cc');
      b(0,1.15,.02,.30,.22,.12,'#f3f5f7');b(0,1.16,.083,.22,.15,.005,'#14324d');b(0,1.03,.04,.30,.03,.12,accent);b(0,1.285,0,.18,.03,.04,'#d7dee5');
      b(-.04,1.19,.087,.14,.006,.004,'#7ce3cc');b(-.04,1.15,.087,.14,.006,.004,'#f4a261');b(-.04,1.11,.087,.14,.006,.004,'#80c7ee');b(.08,1.16,.087,.04,.06,.004,'#7ce3cc');
      c(.17,1.0,.06,.02,.25,.02,'#3a4c60');
    } else if(type==='care-bed') {
      const board='#b89c7a',rail='#d3dbe3';
      for(const x of [-.95,.95])for(const z of [-.38,.38])c(x,.06,z,.11,.12,.11,dark);
      b(0,.20,0,2.0,.08,.80,'#cfd8e0');for(const x of [-.55,.55])b(x,.30,0,.06,.16,.06,metal);
      b(.05,.42,0,1.90,.06,.88,metal);b(.40,.53,0,1.20,.14,.86,white);b(-.55,.66,0,.72,.14,.86,white,0,0,-.38);
      b(-.80,.81,0,.28,.08,.55,'#e9f1fb',0,0,-.38);b(.45,.61,0,1.05,.02,.88,accent);
      b(-1.04,.62,0,.06,.72,.98,board);b(1.04,.55,0,.06,.56,.98,board);
      for(const z of [-.47,.47]){b(-.45,.74,z,.78,.18,.03,rail);b(.45,.68,z,.68,.15,.03,rail);}
    } else if(type==='dental-chair') {
      const tube='#b8c3cd';
      for(const z of [-.35,.45])b(0,.03,z,.72,.04,.05,tube);
      for(const x of [-.30,.30]){b(x,.25,-.35,.04,.42,.04,tube);b(x,.22,.45,.04,.36,.04,tube);b(x,.42,.05,.04,.04,.92,tube);}
      b(0,.50,.02,.58,.10,.50,accent);
      b(0,.72,-.47,.58,.62,.08,accent,-1.0);b(0,.94,-.80,.30,.16,.07,accent,-1.0);     // reclined back + headrest
      b(0,.42,.56,.52,.07,.62,accent,.35);                                             // leg rest sloping down
      for(const x of [-.32,.32]){b(x,.62,-.02,.06,.04,.34,'#d4dce3');b(x,.56,-.02,.03,.10,.03,metal);}
      c(.42,.76,-.20,.03,.52,.03,metal);b(.42,1.02,-.06,.30,.03,.22,'#e8edf1');b(.42,1.045,-.06,.26,.02,.18,'#cfd8e0');
    } else if(type==='crash-cart') {
      for(const x of [-.28,.28])for(const z of [-.21,.21])c(x,.05,z,.09,.10,.09,dark);
      b(0,.55,0,.66,.86,.52,accent);
      for(let i=0;i<5;i++){const y=.21+i*.155;b(0,y,.262,.60,.13,.01,'#d9615a');b(0,y,.272,.30,.025,.02,'#f2f2f2');}
      b(0,1.0,0,.70,.04,.55,'#e9ecef');b(0,1.035,-.265,.70,.035,.02,'#d0d6dc');
      for(const x of [-.22,.22])b(x,1.08,-.18,.025,.12,.025,metal);b(0,1.14,-.10,.50,.03,.36,'#d0d6dc');b(0,1.21,-.10,.30,.12,.22,'#f2c94c');b(0,1.22,.012,.12,.05,.005,'#2d3743');
      b(-.365,.95,0,.03,.03,.40,metal);for(const z of [-.18,.18])b(-.35,.95,z,.03,.03,.03,metal);
    } else if(type==='steel-cart') {
      const steel='#c9d2da';
      for(const x of [-.30,.30])for(const z of [-.20,.20]){b(x,.50,z,.03,.90,.03,steel);c(x,.05,z,.08,.10,.08,dark);}
      b(0,.22,0,.65,.03,.46,accent);b(0,.86,0,.65,.03,.46,accent);for(const z of [-.225,.225])b(0,.885,z,.65,.03,.01,steel);
      b(0,.78,0,.56,.10,.40,'#d6dde3');b(0,.78,.205,.56,.10,.006,'#cdd5dc');b(0,.78,.215,.16,.02,.02,'#8a98a6');
      for(const z of [-.16,.16])b(-.33,.96,z,.03,.18,.03,steel);b(-.33,1.05,0,.03,.03,.36,steel);
    } else if(type==='utility-cart') {
      const pvc='#e3e8ec',shelf='#eef1f4';
      for(const x of [-.34,.34])for(const z of [-.19,.19]){c(x,.47,z,.04,.86,.04,pvc);c(x,.05,z,.08,.10,.08,dark);}
      for(const y of [.18,.50,.82]){b(0,y,0,.74,.035,.44,shelf);for(const z of [-.215,.215])b(0,y+.03,z,.74,.04,.012,pvc);for(const x of [-.365,.365])b(x,y+.03,0,.012,.04,.44,pvc);}
      b(0,.72,0,.60,.09,.38,shelf);b(0,.72,.195,.60,.09,.008,accent);b(0,.72,.203,.14,.02,.02,'#2f5f9e');
      for(const z of [-.14,.14])b(-.40,.86,z,.03,.10,.03,pvc);b(-.40,.91,0,.03,.03,.32,pvc);
    } else {
      // A new product without a known template remains visible as a sized box.
      b(0, definition.height / 2, 0, definition.width, definition.height, definition.depth, accent);
    }

    // Custom products reuse approximate geometry, scaled to their stated envelope.
    // This is not a manufacturer CAD model or a fit/safety certification.
    if (definition.modelType && type !== 'box' && parts.length) {
      const low = [Infinity, Infinity, Infinity];
      const high = [-Infinity, -Infinity, -Infinity];
      for (const part of parts) {
        for (const x of [-0.5, 0.5]) for (const y of [-0.5, 0.5]) for (const z of [-0.5, 0.5]) {
          const point = M.transform(part.matrix, [x, y, z, 1]);
          for (let axis = 0; axis < 3; axis++) {
            low[axis] = Math.min(low[axis], point[axis]);
            high[axis] = Math.max(high[axis], point[axis]);
          }
        }
      }
      const fit = M.multiply(
        M.scale(definition.width / (high[0] - low[0]), definition.height / (high[1] - low[1]), definition.depth / (high[2] - low[2])),
        M.translate(-(low[0] + high[0]) / 2, -low[1], -(low[2] + high[2]) / 2)
      );
      for (const part of parts) part.matrix = M.multiply(fit, part.matrix);
    }
    return parts;
  }
  const cache=new Map();
  function buildScene(state,selected,conflicts) {
    const {width:w,depth:d}=state.room,commands=[],lines=[];
    const push=(shape,pos,size,col,extra={})=>commands.push({shape,matrix:M.compose(pos,size),color:hex(col),...extra});
    push('box',[0,-.123,0],[w+.22,.24,d+.22],'#c3cedb');push('box',[0,-.025,0],[w,.05,d],'#edf3f7');
    const wallH=2.65;
    push('box',[0,wallH/2,-d/2-.06],[w+.24,wallH,.12],'#dce6ef',{wall:'back'});
    push('box',[-w/2-.06,wallH/2,0],[.12,wallH,d],'#edf1f6',{wall:'left'});
    push('box',[0,.09,-d/2+.025],[w,.18,.05],'#aabacb',{wall:'back'});
    push('box',[-w/2+.025,.09,0],[.05,.18,d],'#bdcbd7',{wall:'left'});
    push('box',[0,wallH,-d/2-.06],[w+.24,.06,.15],'#f8fbfd',{wall:'back'});
    push('box',[-w/2-.06,wallH,0],[.15,.06,d],'#f8fbfd',{wall:'left'});
    const wx=Math.min(.6,w/2-1);
    push('box',[wx,1.85,-d/2+.04],[1.6,1.05,.08],'#ffffff',{wall:'back'});
    push('box',[wx,1.85,-d/2+.09],[1.45,.90,.025],'#b2d5e8',{wall:'back',unlit:true});
    push('box',[wx,1.85,-d/2+.115],[.045,.92,.025],'#f5fafc',{wall:'back'});
    push('box',[wx,1.85,-d/2+.115],[1.45,.035,.025],'#f5fafc',{wall:'back'});
    if(w>4){push('box',[-w/2+.85,1.9,-d/2+.04],[.55,.55,.06],'#f8fafc',{wall:'back'});push('box',[-w/2+.85,1.9,-d/2+.08],[.27,.075,.02],'#6194c9',{wall:'back'});push('box',[-w/2+.85,1.9,-d/2+.08],[.075,.27,.02],'#6194c9',{wall:'back'});}
    const grid=[];
    for(let x=-w/2+.5;x<w/2;x+=.5)grid.push(x,.008,-d/2,x,.008,d/2);
    for(let z=-d/2+.5;z<d/2;z+=.5)grid.push(-w/2,.008,z,w/2,.008,z);
    lines.push({points:grid,color:hex('#d8e3ec'),grid:true});
    const dim=[-w/2,.015,d/2+.35,w/2,.015,d/2+.35,-w/2,.015,d/2+.22,-w/2,.015,d/2+.47,w/2,.015,d/2+.22,w/2,.015,d/2+.47,w/2+.35,.015,-d/2,w/2+.35,.015,d/2,w/2+.22,.015,-d/2,w/2+.47,.015,-d/2,w/2+.22,.015,d/2,w/2+.47,.015,d/2];
    lines.push({points:dim,color:hex('#99aabe')});
    for(const item of state.instances) {
      if(!cache.has(item.productId))cache.set(item.productId,model(item.productId));
      const root=M.multiply(M.translate(item.x,0,item.z),M.ry(item.rotation*Math.PI/180));
      const defForShadow=ClinicData.catalogue.find(p=>p.id===item.productId);
      for(const part of cache.get(item.productId))commands.push({...part,matrix:M.multiply(root,part.matrix),instanceId:item.instanceId,footprint:[defForShadow.width,defForShadow.depth],origin:[item.x,item.z],rotation:item.rotation});
      if(item.instanceId===selected||conflicts.has(item.instanceId)){
        const def=ClinicData.catalogue.find(p=>p.id===item.productId),pad=.07,ww=def.width/2+pad,dd=def.depth/2+pad;
        const corners=[[-ww,.02,-dd],[ww,.02,-dd],[ww,.02,dd],[-ww,.02,dd]].map(p=>M.transform(root,p).slice(0,3)),pts=[];
        for(let i=0;i<4;i++)pts.push(...corners[i],...corners[(i+1)%4]);
        lines.push({points:pts,color:hex(conflicts.has(item.instanceId)?'#d68130':'#2675df')});
      }
    }
    return {commands,lines};
  }
  window.ClinicModels={buildScene};
})();


/* Single source of truth for the room, quantities and positions.
 * No DOM or rendering code here. All incoming catalogue choices are validated.
 */
(function () {
  'use strict';
  const {catalogue,aliases}=ClinicData;
  const clone=v=>JSON.parse(JSON.stringify(v));
  const round=v=>Math.round(v*1000)/1000;
  const getDef=id=>catalogue.find(p=>p.id===id);
  function normalize(items) {
    if(!Array.isArray(items)||items.length>catalogue.length)throw new Error('Provide an equipment array with at most '+catalogue.length+' product types.');
    const seen=new Set();let total=0;
    const result=items.map(row=>{if(!row||typeof row!=='object')throw new Error('Each equipment entry must be an object.');const raw=row.productId??row.id,id=aliases[raw]||raw;
      if(!getDef(id))throw new Error('Unknown product ID: '+String(raw)+'. Map real catalogue IDs to supported models first.');
      if(seen.has(id))throw new Error('Duplicate product ID: '+id);seen.add(id);
      if(!Number.isInteger(row.quantity)||row.quantity<0||row.quantity>8)throw new Error('Quantity must be a whole number from 0 to 8.');total+=row.quantity;return {productId:id,quantity:row.quantity};});
    if(total>24)throw new Error('This demo supports at most 24 equipment instances in one room.');
    return result.filter(r=>r.quantity>0);
  }
  function dimensions(item){const p=getDef(item.productId),swap=Math.round(item.rotation/90)%2;return swap?{width:p.depth,depth:p.width}:{width:p.width,depth:p.depth};}
  function clampItem(item,room){const s=dimensions(item),mx=Math.max(0,(room.width-s.width)/2-.06),mz=Math.max(0,(room.depth-s.depth)/2-.06);item.x=round(Math.max(-mx,Math.min(mx,item.x)));item.z=round(Math.max(-mz,Math.min(mz,item.z)));}
  function overlaps(a,b,padding=0){const aa=dimensions(a),bb=dimensions(b);return Math.abs(a.x-b.x)<(aa.width+bb.width)/2+padding-.001 && Math.abs(a.z-b.z)<(aa.depth+bb.depth)/2+padding-.001;}
  function findSpot(item,others,room){const def=getDef(item.productId);item.x=def.preferred[0];item.z=def.preferred[1];clampItem(item,room);if(!others.some(o=>overlaps(item,o,.13)))return;
    const s=dimensions(item),sx=-room.width/2+s.width/2+.15,sz=-room.depth/2+s.depth/2+.15;
    for(let z=sz;z<=room.depth/2-s.depth/2-.10;z+=.25)for(let x=sx;x<=room.width/2-s.width/2-.10;x+=.25){item.x=round(x);item.z=round(z);if(!others.some(o=>overlaps(item,o,.13)))return;}
    item.x=0;item.z=0;clampItem(item,room);
  }
  class Store {
    constructor(){this.state={room:{width:6,depth:5,unit:'m'},instances:[],nextId:1};this.history=[];}
    remember(){this.history.push(clone(this.state));if(this.history.length>30)this.history.shift();}
    snapshot(){return clone(this.state);}
    updateEquipment(input,record=true){const items=normalize(input);if(record)this.remember();const retained=[];
      for(const row of items){const old=this.state.instances.filter(i=>i.productId===row.productId).slice(0,row.quantity);retained.push(...old);}
      for(const row of items){let n=retained.filter(i=>i.productId===row.productId).length;while(n<row.quantity){const item={instanceId:'equipment-'+this.state.nextId++,productId:row.productId,x:0,z:0,rotation:0};findSpot(item,retained,this.state.room);retained.push(item);n++;}}
      this.state.instances=retained;return this.snapshot();
    }
    quantities(){return catalogue.map(p=>({productId:p.id,quantity:this.state.instances.filter(i=>i.productId===p.id).length})).filter(i=>i.quantity>0);}
    setRoom(width,depth,record=true){if(typeof width!=='number'||typeof depth!=='number'||!Number.isFinite(width)||!Number.isFinite(depth)||width<3||width>14||depth<3||depth>14)throw new Error('Room width and depth must each be between 3 and 14 metres.');if(record)this.remember();this.state.room={width:round(width),depth:round(depth),unit:'m'};for(const i of this.state.instances)clampItem(i,this.state.room);}
    move(id,x,z,record=true){if(!Number.isFinite(x)||!Number.isFinite(z))throw new Error('Coordinates must be numbers.');const item=this.state.instances.find(i=>i.instanceId===id);if(!item)return false;if(record)this.remember();item.x=x;item.z=z;clampItem(item,this.state.room);return true;}
    rotate(id,record=true){const i=this.state.instances.find(v=>v.instanceId===id);if(!i)return false;if(record)this.remember();i.rotation=(i.rotation+90)%360;clampItem(i,this.state.room);return true;}
    remove(id){const i=this.state.instances.findIndex(v=>v.instanceId===id);if(i<0)return false;this.remember();this.state.instances.splice(i,1);return true;}
    autoArrange(){this.remember();const placed=[];for(const item of [...this.state.instances].sort((a,b)=>{const aa=dimensions(a),bb=dimensions(b);return bb.width*bb.depth-aa.width*aa.depth;})){findSpot(item,placed,this.state.room);placed.push(item);}}
    undo(){if(!this.history.length)return false;this.state=this.history.pop();return true;}
    conflicts(){const ids=new Set(),pairs=[];const a=this.state.instances;for(let i=0;i<a.length;i++)for(let j=i+1;j<a.length;j++)if(overlaps(a[i],a[j])){ids.add(a[i].instanceId);ids.add(a[j].instanceId);pairs.push([a[i].instanceId,a[j].instanceId]);}return {ids,pairs};}
    export(){return {schemaVersion:1,application:'Clinic.exe Room Studio',units:'metres',room:clone(this.state.room),selectedItems:this.quantities(),layout:clone(this.state.instances),notice:'Illustrative models and dimensions only. Not a construction, accessibility, clearance or clinical-safety assessment. No prices or quote submission included.'};}
    import(data){if(!data||data.schemaVersion!==1||!Array.isArray(data.layout)||data.layout.length>24)throw new Error('Invalid layout file. Use JSON exported by this planner.');
      const room=data.room;if(!room||room.unit!=='m'||![room.width,room.depth].every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=3&&v<=14))throw new Error('Invalid room dimensions or units.');
      const ids=new Set();const instances=data.layout.map(row=>{if(!row||!getDef(row.productId)||typeof row.instanceId!=='string'||!/^equipment-\d+$/.test(row.instanceId)||ids.has(row.instanceId))throw new Error('Invalid or duplicate equipment instance.');ids.add(row.instanceId);if(![row.x,row.z,row.rotation].every(v=>typeof v==='number'&&Number.isFinite(v))||![0,90,180,270].includes(row.rotation))throw new Error('Invalid equipment coordinates or rotation.');const item={instanceId:row.instanceId,productId:row.productId,x:row.x,z:row.z,rotation:row.rotation};clampItem(item,room);return item;});
      normalize(catalogue.map(p=>({productId:p.id,quantity:instances.filter(i=>i.productId===p.id).length})));
      this.remember();this.state={room:{width:room.width,depth:room.depth,unit:'m'},instances,nextId:Math.max(0,...instances.map(i=>Number(i.instanceId.split('-')[1])))+1};
    }
  }
  window.ClinicState={Store,normalize,dimensions,clampItem,overlaps};
})();
