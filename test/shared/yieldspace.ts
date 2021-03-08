import { BigNumber } from 'ethers'
const { bignumber, add, subtract, multiply, divide, pow, floor } = require('mathjs')

function toBN(x: typeof bignumber): BigNumber {
  return BigNumber.from(floor(x).toFixed().toString())
}

function tobn(x: BigNumber): typeof bignumber {
  return bignumber(x.toString())
}

// https://www.desmos.com/calculator/mllhtohxfx
export function mint(daiReserves: BigNumber, fyDaiReserves: BigNumber, supply: BigNumber, dai: BigNumber): [BigNumber, BigNumber] {
  const Z = tobn(daiReserves)
  const Y = tobn(fyDaiReserves)
  const S = tobn(supply)
  const z = tobn(dai)
  const m = divide(multiply(S, z), Z)
  const y = divide(multiply(Y, m), S)

  return [toBN(m), toBN(y)]
}

export function mintWithDai(
  daiReserves: BigNumber,
  fyDaiReservesVirtual: BigNumber,
  fyDaiReservesReal: BigNumber,
  supply: BigNumber,
  fyDai: BigNumber,
  timeTillMaturity: BigNumber
): [BigNumber, BigNumber] {
  const Z = tobn(daiReserves)
  const YV = tobn(fyDaiReservesVirtual)
  const YR = tobn(fyDaiReservesReal)
  const S = tobn(supply)
  const y = tobn(fyDai)
  const T = tobn(timeTillMaturity)

  const z1 = tobn(buyFYDai(Z, YV, y, T)) // Buy fyDai
  // Mint specifying how much fyDai to take in. Reverse of `mint`.
  const m = divide(multiply(S, y), subtract(YR, y))
  const z2 = divide(multiply(add(Z, z1), m), S)

  return [toBN(m), toBN(add(z1, z2))]
}

// https://www.desmos.com/calculator/ubsalzunpo
export function burn(daiReserves: BigNumber, fyDaiReserves: BigNumber, supply: BigNumber, lpTokens: BigNumber): [BigNumber, BigNumber] {
  const Z = tobn(daiReserves)
  const Y = tobn(fyDaiReserves)
  const S = tobn(supply)
  const x = tobn(lpTokens)
  const z = divide(multiply(x, Z), S)
  const y = divide(multiply(x, Y), S)

  return [toBN(z), toBN(y)]
}

export function burnForDai(
  daiReserves: BigNumber,
  fyDaiReservesVirtual: BigNumber,
  fyDaiReservesReal: BigNumber,
  supply: BigNumber,
  lpTokens: BigNumber,
  timeTillMaturity: BigNumber
): BigNumber {
  const Z = tobn(daiReserves)
  const YV = tobn(fyDaiReservesVirtual)
  const YR = tobn(fyDaiReservesReal)
  const S = tobn(supply)
  const x = tobn(lpTokens)
  const T = tobn(timeTillMaturity)

  const [z1, y] = burn(Z, YR, S, x)
  const z2 = sellFYDai(Z, YV, y, T)

  return toBN(add(tobn(z1), tobn(z2)))
}

// https://www.desmos.com/calculator/5nf2xuy6yb
export function sellDai(daiReserves: BigNumber, fyDaiReserves: BigNumber, dai: BigNumber, timeTillMaturity: BigNumber): BigNumber {
  const fee = bignumber(1000000000000)
  const Z = tobn(daiReserves)
  const Y = tobn(fyDaiReserves)
  const T = tobn(timeTillMaturity)
  const x = tobn(dai)
  const k = bignumber(1 / (4 * 365 * 24 * 60 * 60)) // 1 / seconds in four years
  const g = bignumber(950 / 1000)
  const t = multiply(k, T)
  const a = subtract(1, multiply(g, t))
  const invA = divide(1, a)
  const Za = pow(Z, a)
  const Ya = pow(Y, a)
  const Zxa = pow(add(Z, x), a)
  const sum = subtract(add(Za, Ya), Zxa)
  const y = subtract(Y, pow(sum, invA))
  const yFee = subtract(y, fee)

  return toBN(yFee)
}

// https://www.desmos.com/calculator/6jlrre7ybt
export function sellFYDai(daiReserves: BigNumber, fyDaiReserves: BigNumber, fyDai: BigNumber, timeTillMaturity: BigNumber): BigNumber {
  const fee = bignumber(1000000000000)
  const Z = tobn(daiReserves)
  const Y = tobn(fyDaiReserves)
  const T = tobn(timeTillMaturity)
  const x = tobn(fyDai)
  const k = bignumber(1 / (4 * 365 * 24 * 60 * 60)) // 1 / seconds in four years
  const g = bignumber(1000 / 950)
  const t = multiply(k, T)
  const a = subtract(1, multiply(g, t))
  const invA = divide(1, a)
  const Za = pow(Z, a)
  const Ya = pow(Y, a)
  const Yxa = pow(add(Y, x), a)
  const sum = add(Za, subtract(Ya, Yxa))
  const y = subtract(Z, pow(sum, invA))
  const yFee = subtract(y, fee)

  return toBN(yFee)
}

// https://www.desmos.com/calculator/0rgnmtckvy
export function buyDai(daiReserves: BigNumber, fyDaiReserves: BigNumber, dai: BigNumber, timeTillMaturity: BigNumber): BigNumber {
  const fee = bignumber(1000000000000)
  const Z = tobn(daiReserves)
  const Y = tobn(fyDaiReserves)
  const T = tobn(timeTillMaturity)
  const x = tobn(dai)
  const k = bignumber(1 / (4 * 365 * 24 * 60 * 60)) // 1 / seconds in four years
  const g = bignumber(1000 / 950)
  const t = multiply(k, T)
  const a = subtract(1, multiply(g, t))
  const invA = divide(1, a)
  const Za = pow(Z, a)
  const Ya = pow(Y, a)
  const Zxa = pow(subtract(Z, x), a)
  const sum = subtract(add(Za, Ya), Zxa)
  const y = subtract(pow(sum, invA), Y)
  const yFee = add(y, fee)

  return toBN(yFee)
}

// https://www.desmos.com/calculator/ws5oqj8x5i
export function buyFYDai(daiReserves: BigNumber, fyDaiReserves: BigNumber, fyDai: BigNumber, timeTillMaturity: BigNumber): BigNumber {
  const fee = bignumber(1000000000000)
  const Z = tobn(daiReserves)
  const Y = tobn(fyDaiReserves)
  const T = tobn(timeTillMaturity)
  const x = tobn(fyDai)
  const k = bignumber(1 / (4 * 365 * 24 * 60 * 60)) // 1 / seconds in four years
  const g = bignumber(950 / 1000)
  const t = multiply(k, T)
  const a = subtract(1, multiply(g, t))
  const invA = divide(1, a)
  const Za = pow(Z, a)
  const Ya = pow(Y, a)
  const Yxa = pow(subtract(Y, x), a)
  const sum = add(Za, subtract(Ya, Yxa))
  const y = subtract(pow(sum, invA), Z)
  const yFee = add(y, fee)

  return toBN(yFee)
}
