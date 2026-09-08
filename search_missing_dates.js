const XLSX = require('./frontend/node_modules/xlsx');
const path = require('path');

const filePath = 'c:\\Users\\rosas\\OneDrive\\Desktop\\Gestión de Stocks\\frontend\\inventario_301_unicos.xlsx';

try {
    const workbook = XLSX.readFile(filePath, { cellDates: true });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    const rawJson = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

    const targets = ["Gaseosa Uva 3L", "Leche Descremada 1L", "Frijoles Cargamanto 1kg", "Queso Campesino 400g", "Gaseosa Cola 3L"];

    targets.forEach(name => {
        const found = rawJson.find(p => p.nombre === name);
        if (found) {
            console.log(`\nProducto: ${name}`);
            console.log(JSON.stringify(found, null, 2));
        } else {
            console.log(`\nProducto ${name} no encontrado en Excel.`);
        }
    });

} catch (error) {
    console.error("Error:", error.message);
}
