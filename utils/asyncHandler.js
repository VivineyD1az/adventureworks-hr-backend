// Envuelve un controlador async para capturar errores automaticamente
// y enviarlos al middleware de manejo de errores (evita repetir try/catch en cada funcion)
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;
