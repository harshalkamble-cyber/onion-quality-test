import bcrypt from 'bcryptjs';
import { pool, query } from './db.js';

async function main(){
 const name=process.env.ADMIN_NAME?.trim();const email=process.env.ADMIN_EMAIL?.trim().toLowerCase();const password=process.env.ADMIN_PASSWORD;
 if(!name||!email||!password||password.length<14)throw new Error('Set ADMIN_NAME, ADMIN_EMAIL, and a unique ADMIN_PASSWORD of at least 14 characters.');
 const passwordHash=await bcrypt.hash(password,12);
 const existing=await query<{id:string}>('SELECT id FROM users WHERE email=$1',[email]);
 if(existing.rows[0]){await query("UPDATE users SET role='admin',is_active=TRUE WHERE id=$1",[existing.rows[0].id]);console.info(`Promoted existing user ${email} to admin.`)}
 else {const created=await query("INSERT INTO users(full_name,email,password_hash,role,preferred_language) VALUES($1,$2,$3,'admin','en') RETURNING id",[name,email,passwordHash]);console.info(`Created admin user ${created.rows[0].id}.`)}
}
main().catch(error=>{console.error(error);process.exitCode=1}).finally(()=>pool.end());
