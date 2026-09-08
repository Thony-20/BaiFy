const XLSX = require('xlsx');

const workbook = XLSX.readFile('lochido_limpio.xlsx');
const firstSheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[firstSheetName];
const rawJson = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

const parsedProducts = rawJson.map((row) => {
const getVal = (key) => row[key] || '';
const atributo = getVal('ATRIBUTO');
const valor1 = getVal('VALOR1');

let atributosObj = {};
if (atributo && valor1) {
    atributosObj[String(atributo)] = String(valor1);
}

const rawEstado = getVal('ESTADO') ? String(getVal('ESTADO')).toLowerCase().trim() : 'activo';

return {
    nombre: getVal('NOMBRE'),
    sku: getVal('SKU'),
    descripcion: getVal('DESCRIPCIÓN') || getVal('DESCRIPCION'),
    stock: parseInt(getVal('STOCK')) || 0,
    estado: rawEstado === 'inactivo' ? 'inactivo' : 'activo',
    valor: parseFloat(getVal('VALOR')) || 0,
    atributos: atributosObj,
};
}).filter(p => p.sku && p.nombre);

console.log(`Raw rows: ${rawJson.length}`);
console.log(`Parsed valid products: ${parsedProducts.length}`);
