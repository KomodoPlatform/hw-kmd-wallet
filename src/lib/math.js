const convertExponentialToDecimal = (exponentialNumber) => {
  // sanity check - is it exponential number
  const str = exponentialNumber.toString();
  if (str.indexOf('e') !== -1) {
    const exponent = parseInt(str.split('-')[1], 10);
    // Unfortunately I can not return 1e-8 as 0.00000001, because even if I call parseFloat() on it,
    // it will still return the exponential representation
    // So I have to use .toFixed()
    const result = exponentialNumber.toFixed(exponent);
    return result;
  } else {
    return exponentialNumber;
  }
}

const fromSats = value => convertExponentialToDecimal(Number(Number(value * 0.00000001).toFixed(8)));

const toSats = value => Number((Number(value).toFixed(8) * 100000000).toFixed(0));

const maxSpendBalance = (utxoList, fee) => {
  let maxSpendBalance = 0;

  for (let i = 0; i < utxoList.length; i++) {
    maxSpendBalance += Number(utxoList[i].value);
  }

  if (fee) {
    return Number((Number(maxSpendBalance) - Number(fee)).toFixed(8));
  }
  
  return Number(maxSpendBalance);
};

module.exports = {
  fromSats,
  toSats,
  maxSpendBalance
};