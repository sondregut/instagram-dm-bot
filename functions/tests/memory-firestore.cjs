const assert=require('node:assert/strict');
const clone=v=>v&&typeof v==='object'?(typeof v.toMillis==='function'?v:Array.isArray(v)?v.map(clone):Object.fromEntries(Object.entries(v).map(([k,x])=>[k,clone(x)]))):v;
function memoryFirestore() {
 const records=new Map();let lock=Promise.resolve();
 const read=k=>clone(records.get(k));
 const apply=(key,values,merge)=>{
   const current=merge?(read(key)||{}):{};
   for(const [k,v] of Object.entries(values)){
     if(v?.constructor?.name==='DeleteTransform')delete current[k];
     else if(v?.constructor?.name==='ArrayUnionTransform')current[k]=[...(current[k]||[]),...v.elements.map(clone)];
     else if(v?.constructor?.name==='NumericIncrementTransform')current[k]=(current[k]||0)+v.operand;
     else current[k]=clone(v);
   }records.set(key,current);
 };
 class Ref {
   constructor(key){this.path=key;this.id=key.split('/').at(-1);}
   async get(){const value=read(this.path);return{id:this.id,ref:this,exists:records.has(this.path),data:()=>clone(value)};}
   async set(v,o){apply(this.path,v,!!o?.merge);}
   async update(v){assert(records.has(this.path),'missing mock doc '+this.path);apply(this.path,v,true);}
   async create(v){assert(!records.has(this.path),'duplicate mock doc '+this.path);apply(this.path,v,false);}
 }
 class Query {
   constructor(name,filters=[],limit=Infinity){this.name=name;this.filters=filters;this.maximum=limit;}
   doc(id){return new Ref(this.name+'/'+id);}
   where(key,op,value){return new Query(this.name,[...this.filters,{key,op,value}],this.maximum);}
   limit(n){return new Query(this.name,this.filters,n);}
   orderBy(){return this;}
   async get(){const docs=[];for(const key of records.keys()){
     if(!key.startsWith(this.name+'/'))continue;const data=read(key);
     if(this.filters.every(f=>f.op==='=='?data[f.key]===f.value:f.op==='in'?f.value.includes(data[f.key]):f.op==='<='?data[f.key]?.toMillis()<=f.value.toMillis():false))docs.push(await new Ref(key).get());
   }const result=docs.slice(0,this.maximum);return{docs:result,size:result.length,empty:!result.length};}
 }
 const tx={get:r=>r.get(),set:(r,v,o)=>{apply(r.path,v,!!o?.merge);return tx;},update:(r,v)=>{assert(records.has(r.path));apply(r.path,v,true);return tx;},create:(r,v)=>{assert(!records.has(r.path));apply(r.path,v,false);return tx;}};
 return {records,collection:name=>new Query(name),runTransaction:fn=>{const result=lock.then(()=>fn(tx));lock=result.catch(()=>{});return result;}};
}
module.exports={memoryFirestore};
