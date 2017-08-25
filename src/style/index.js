function CartoCSS(style) {
  if (typeof style === 'string') {
    return style;
  }
  throw TypeError('styles.CartoCSS only supports string parameters');
}

module.exports = {
  CartoCSS: CartoCSS
};
