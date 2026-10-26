export type StoredOfflineFile = { blob: Blob; name: string; type: string; lastModified: number };
export type PendingOfflineBatch = { id: string; source: 'upload'|'camera'|'bulk'; files: StoredOfflineFile[]; createdAt: number };
const DB_NAME = 'oniongrade-offline';
const STORE_NAME = 'pending-batches';
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve,reject)=>{
    if(typeof indexedDB==='undefined')return reject(new Error('Offline storage is not available in this browser.'));
    const request=indexedDB.open(DB_NAME,1);
    request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains(STORE_NAME))db.createObjectStore(STORE_NAME,{keyPath:'id'});};
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error??new Error('Could not open offline storage.'));
  });
}
export async function savePendingBatch(files:File[],source:'upload'|'camera'|'bulk') {
  const db=await openDatabase();const batch:PendingOfflineBatch={id:crypto.randomUUID(),source,files:files.map(file=>({blob:file.slice(0,file.size,file.type),name:file.name,type:file.type,lastModified:file.lastModified})),createdAt:Date.now()};
  await new Promise<void>((resolve,reject)=>{const tx=db.transaction(STORE_NAME,'readwrite');tx.objectStore(STORE_NAME).put(batch);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error??new Error('Could not save the offline scan.'));tx.onabort=()=>reject(tx.error??new Error('Offline scan storage was aborted.'));});db.close();return batch.id;
}
export async function listPendingBatches():Promise<PendingOfflineBatch[]> {
  const db=await openDatabase();const rows=await new Promise<PendingOfflineBatch[]>((resolve,reject)=>{const tx=db.transaction(STORE_NAME,'readonly');const req=tx.objectStore(STORE_NAME).getAll();req.onsuccess=()=>resolve(req.result as PendingOfflineBatch[]);req.onerror=()=>reject(req.error??new Error('Could not read offline scans.'));});db.close();return rows.sort((a,b)=>a.createdAt-b.createdAt);
}
export async function deletePendingBatch(id:string) {
  const db=await openDatabase();await new Promise<void>((resolve,reject)=>{const tx=db.transaction(STORE_NAME,'readwrite');tx.objectStore(STORE_NAME).delete(id);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error??new Error('Could not remove uploaded offline scan.'));});db.close();
}
