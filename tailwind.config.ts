import type { Config } from 'tailwindcss';
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: { extend: {
    colors: { farm: { 50:'#f4f8ee',100:'#e7f0db',200:'#cedfba',300:'#a9c98d',400:'#7fa95d',500:'#5c8b3e',600:'#456e2e',700:'#365625',800:'#2c4521',900:'#24391d' }, ink:'#20261f', cream:'#fbfaf5' },
    boxShadow: { soft:'0 14px 40px rgba(35,55,24,.08)' },
    fontFamily: { sans:['Arial','Helvetica','sans-serif'] },
    borderRadius: { '4xl':'2rem' }
  } }, plugins: []
};
export default config;
