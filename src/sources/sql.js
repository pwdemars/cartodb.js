function SQL(query) {
  if (typeof query === 'string') {
    return query;
  }
  throw TypeError('sources.SQL only supports string parameters');
}


module.exports = SQL;


