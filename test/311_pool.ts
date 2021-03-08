import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'

import { Pool } from '../typechain/Pool'
import { PoolFactory } from '../typechain/PoolFactory'
import { DaiMock as Dai } from '../typechain/DaiMock'
import { FYDaiMock as FYDai } from '../typechain/FYDaiMock'
import { YieldSpaceEnvironment } from './shared/fixtures'

import { BigNumber } from 'ethers'

import { ethers, waffle } from 'hardhat'
import { expect } from 'chai'
const { loadFixture } = waffle

const timeMachine = require('ether-time-traveler')

function almostEqual(x: BigNumber, y: BigNumber, p: BigNumber) {
  // Check that abs(x - y) < p:
  const diff = x.gt(y) ? BigNumber.from(x).sub(y) : BigNumber.from(y).sub(x) // Not sure why I have to convert x and y to BigNumber
  expect(diff.div(p)).to.eq(0)    // Hack to avoid silly conversions. BigNumber truncates decimals off.
}

async function currentTimestamp() {
  return (await ethers.provider.getBlock(ethers.provider.getBlockNumber())).timestamp
}

import { mint, mintWithDai, burn, burnForDai, sellDai, sellFYDai, buyDai, buyFYDai } from './shared/yieldspace'
const WAD = BigNumber.from('1000000000000000000')

describe('Pool', async function() {
  this.timeout(0)

  // These values impact the pool results
  const daiTokens = BigNumber.from('1000000000000000000000000')
  const fyDaiTokens = daiTokens
  const initialDai = daiTokens
  const OVERRIDES = { gasLimit: 1_000_000 }

  let snapshotId: string
  let ownerAcc: SignerWithAddress
  let user1Acc: SignerWithAddress
  let user2Acc: SignerWithAddress
  let operatorAcc: SignerWithAddress
  let owner: string
  let user1: string
  let user2: string
  let operator: string

  let yieldSpace: YieldSpaceEnvironment
  let factory: PoolFactory

  let pool: Pool
  let poolFromUser1: Pool
  let poolFromOwner: Pool

  let dai: Dai
  let daiFromOwner: Dai
  let daiFromUser1: Dai
  let fyDai1: FYDai
  let fyDai1FromUser1: FYDai
  let fyDai1FromOwner: FYDai
  let maturity1: BigNumber

  const baseId = ethers.utils.hexlify(ethers.utils.randomBytes(6))
  const fyTokenId = ethers.utils.hexlify(ethers.utils.randomBytes(6))

  async function fixture() {
    return await YieldSpaceEnvironment.setup(ownerAcc, [baseId], [fyTokenId])
  }

  before(async () => {
    snapshotId = await timeMachine.takeSnapshot(ethers.provider)

    const signers = await ethers.getSigners()
    ownerAcc = signers[0]
    owner = ownerAcc.address
    user1Acc = signers[1]
    user1 = user1Acc.address
    user2Acc = signers[2]
    user2 = user2Acc.address
    operatorAcc = signers[3]
    operator = operatorAcc.address
  })

  after(async () => {
    await timeMachine.revertToSnapshot(ethers.provider, snapshotId)
  })

  beforeEach(async () => {
    yieldSpace = await loadFixture(fixture)
    factory = yieldSpace.factory as PoolFactory
    dai = yieldSpace.bases.get(baseId) as Dai
    daiFromUser1 = dai.connect(user1Acc)
    daiFromOwner = dai.connect(ownerAcc)

    fyDai1 = yieldSpace.fyTokens.get(fyTokenId) as FYDai
    fyDai1FromUser1 = fyDai1.connect(user1Acc)
    fyDai1FromOwner = fyDai1.connect(ownerAcc)
    
    pool = (yieldSpace.pools.get(baseId) as Map<string, Pool>).get(fyTokenId) as Pool
    poolFromUser1 = pool.connect(user1Acc)
    poolFromOwner = pool.connect(ownerAcc)

    maturity1 = await fyDai1.maturity()
  })

  it('should setup pool', async () => {
    const b = BigNumber.from('18446744073709551615')
    const k = b.div('126144000')
    expect(await pool.k()).to.be.equal(k)
  })

  it('adds initial liquidity', async () => {
    await dai.mint(user1, initialDai)

    await daiFromUser1.approve(pool.address, initialDai)
    await expect(poolFromUser1.mint(user1, user1, initialDai))
      .to.emit(pool, 'Liquidity')
      .withArgs(
        maturity1,
        user1,
        user1,
        initialDai.mul(-1),
        0,
        initialDai 
      )

    expect(
      await poolFromUser1.balanceOf(user1)
    ).to.equal(
      initialDai,
      'User1 should have ' + initialDai + ' liquidity tokens'
    )
  })

  describe('with initial liquidity', () => {
    beforeEach(async () => {
      await dai.mint(user1, initialDai)
      await daiFromUser1.approve(pool.address, initialDai)
      await poolFromUser1.mint(user1, user1, initialDai)
    })

    it('sells fyDai', async () => {
      const daiReserves = await pool.getBaseTokenReserves()
      const fyDaiReserves = await pool.getFYTokenReserves()
      const fyDaiIn = WAD
      const timeTillMaturity = maturity1.sub(await currentTimestamp())
      
      expect(
        await dai.balanceOf(user2)
      ).to.equal(
        0,
        "'User2' wallet should have no dai, instead has " + (await dai.balanceOf(user2))
      )
      
      // Test preview since we are here
      const daiOutPreview = await poolFromUser1.sellFYTokenPreview(fyDaiIn)

      const expectedDaiOut = sellFYDai(
        daiReserves,
        fyDaiReserves,
        fyDaiIn,
        timeTillMaturity
      )

      await fyDai1FromUser1.mint(user1, fyDaiIn)
      await fyDai1FromUser1.approve(pool.address, fyDaiIn)
      await expect(poolFromUser1.sellFYToken(user1, user2, fyDaiIn))
        .to.emit(pool,'Trade')
        .withArgs(
          maturity1,
          user1,
          user2,
          await daiFromUser1.balanceOf(user2),
          fyDaiIn.mul(-1),  
        )

      expect(await fyDai1.balanceOf(user1)).to.equal(0, "'From' wallet should have no fyDai tokens")

      const daiOut = await dai.balanceOf(user2)

      almostEqual(daiOut, expectedDaiOut, fyDaiIn.div(1000000))
      almostEqual(daiOutPreview, expectedDaiOut, fyDaiIn.div(1000000))
    })

    it('buys dai', async () => {
      const daiReserves = await pool.getBaseTokenReserves()
      const fyDaiReserves = await pool.getFYTokenReserves()
      const daiOut = WAD.mul(10) // TODO: This runs out of gas with WAD, why?
      
      const timeTillMaturity = maturity1.sub(await currentTimestamp())


      expect(
        await dai.balanceOf(user2)
      ).to.equal(
        0,
        "'User2' wallet should have no dai, instead has " + (await dai.balanceOf(user2))
      )

      // Test preview since we are here
      const fyDaiInPreview = await poolFromUser1.buyBaseTokenPreview(daiOut)

      const expectedFYDaiIn = buyDai(
        daiReserves,
        fyDaiReserves,
        daiOut,
        timeTillMaturity
      )

      await fyDai1FromUser1.mint(user1, fyDaiTokens)
      await fyDai1FromUser1.approve(pool.address, fyDaiTokens)

      
      await expect(poolFromUser1.buyBaseToken(user1, user2, daiOut, OVERRIDES))
        .to.emit(pool, 'Trade')
        .withArgs(
          maturity1,
          user1,
          user2,
          daiOut,
          fyDaiTokens.sub(await fyDai1.balanceOf(user1)).mul(-1),
        )

      const fyDaiIn = fyDaiTokens.sub(await fyDai1.balanceOf(user1))
      expect(await dai.balanceOf(user2)).to.equal(daiOut, 'Receiver account should have 1 dai token')

      almostEqual(fyDaiIn, expectedFYDaiIn, daiOut.div(1000000))
      almostEqual(fyDaiInPreview, expectedFYDaiIn, daiOut.div(1000000))
    })

    describe('with extra fyDai reserves', () => {
      beforeEach(async () => {
        const additionalFYDaiReserves = WAD.mul(30)
        await fyDai1FromOwner.mint(owner, additionalFYDaiReserves)
        await fyDai1FromOwner.approve(pool.address, additionalFYDaiReserves)
        await poolFromOwner.sellFYToken(owner, owner, additionalFYDaiReserves)
      })

      it('mints liquidity tokens', async () => {
        const daiReserves = await dai.balanceOf(pool.address)
        const fyDaiReserves = await fyDai1.balanceOf(pool.address)
        const supply = await pool.totalSupply()
        const daiIn = WAD

        await daiFromUser1.mint(user1, daiIn)
        await fyDai1FromUser1.mint(user1, fyDaiTokens)

        const fyDaiBefore = await fyDai1.balanceOf(user1)
        const poolTokensBefore = await pool.balanceOf(user2)

        await daiFromUser1.approve(pool.address, WAD)
        await fyDai1FromUser1.approve(pool.address, fyDaiTokens)
        await expect(poolFromUser1.mint(user1, user2, WAD))
          .to.emit(pool, 'Liquidity')
          .withArgs(
            maturity1,
            user1,
            user2,
            WAD.mul(-1),
            fyDaiBefore.sub(await fyDai1.balanceOf(user1)).mul(-1),
            (await pool.balanceOf(user2)).sub(poolTokensBefore),            
          )

        const [expectedMinted, expectedFYDaiIn] = mint(daiReserves, fyDaiReserves, supply, daiIn)

        const minted = (await pool.balanceOf(user2)).sub(poolTokensBefore)
        const fyDaiIn = fyDaiBefore.sub(await fyDai1.balanceOf(user1))

        almostEqual(minted, expectedMinted, daiIn.div(10000))
        almostEqual(fyDaiIn, expectedFYDaiIn, daiIn.div(10000))
      })

      it('mints liquidity tokens with dai only', async () => {
        const daiReserves = await daiFromOwner.balanceOf(pool.address)
        const fyDaiReservesVirtual = await poolFromOwner.getFYTokenReserves()
        const fyDaiReservesReal = await fyDai1FromOwner.balanceOf(pool.address)
        const supply = await poolFromOwner.totalSupply()
        
        const timeTillMaturity = maturity1.sub(await currentTimestamp())
        const fyDaiToBuy = WAD.div(1000)
        const maxDaiIn = WAD.mul(1000)

        await daiFromOwner.mint(user1, maxDaiIn)

        const daiBefore = await daiFromOwner.balanceOf(user1)
        const poolTokensBefore = await poolFromOwner.balanceOf(user2)

        await daiFromUser1.approve(pool.address, maxDaiIn)
        await expect(poolFromUser1.mintWithToken(user1, user2, fyDaiToBuy, OVERRIDES))
          .to.emit(pool, 'Liquidity')
          .withArgs(
            maturity1,
            user1,
            user2,
            daiBefore.sub(await daiFromOwner.balanceOf(user1)).mul(-1),
            0,
            (await poolFromOwner.balanceOf(user2)).sub(poolTokensBefore),
          )

        const [expectedMinted, expectedDaiIn] = mintWithDai(
          daiReserves,
          fyDaiReservesVirtual,
          fyDaiReservesReal,
          supply,
          fyDaiToBuy,
          timeTillMaturity
        )

        const minted = (await pool.balanceOf(user2)).sub(poolTokensBefore)
        const daiIn = daiBefore.sub(await dai.balanceOf(user1))

        almostEqual(minted, expectedMinted, minted.div(10000))
        almostEqual(daiIn, expectedDaiIn, daiIn.div(10000))
      })

      it('burns liquidity tokens', async () => {
        // Use this to test: https://www.desmos.com/calculator/ubsalzunpo

        const daiReserves = await daiFromOwner.balanceOf(pool.address)
        const fyDaiReserves = await fyDai1FromOwner.balanceOf(pool.address)
        const supply = await poolFromOwner.totalSupply()
        const lpTokensIn = WAD

        await poolFromUser1.approve(pool.address, lpTokensIn)
        await expect(poolFromUser1.burn(user1, user2, lpTokensIn))
          .to.emit(pool, 'Liquidity')
          .withArgs(
            maturity1,
            user1,
            user2,
            daiReserves.sub(await daiFromOwner.balanceOf(pool.address)),
            fyDaiReserves.sub(await fyDai1FromOwner.balanceOf(pool.address)),
            lpTokensIn.mul(-1),
          )

        const [expectedDaiOut, expectedFYDaiOut] = burn(
          daiReserves,
          fyDaiReserves,
          supply,
          lpTokensIn
        )

        const daiOut = daiReserves.sub(await dai.balanceOf(pool.address))
        const fyDaiOut = fyDaiReserves.sub(await fyDai1.balanceOf(pool.address))

        almostEqual(daiOut, expectedDaiOut, daiOut.div(10000))
        almostEqual(fyDaiOut, expectedFYDaiOut, fyDaiOut.div(10000))
      })

      it('burns liquidity tokens to Dai', async () => {
        // Use this to test: https://www.desmos.com/calculator/ubsalzunpo

        const daiReserves = await daiFromOwner.balanceOf(pool.address)
        const fyDaiReservesVirtual = await poolFromOwner.getFYTokenReserves()
        const fyDaiReservesReal = await fyDai1FromOwner.balanceOf(pool.address)
        const supply = await poolFromOwner.totalSupply()
        
        const timeTillMaturity = maturity1.sub(await currentTimestamp())
        const lpTokensIn = WAD.mul(2) // TODO: Why does it run out of gas with 1 WAD?

        await poolFromUser1.approve(pool.address, lpTokensIn)
        await expect(poolFromUser1.burnForBaseToken(user1, user2, lpTokensIn, OVERRIDES))
          .to.emit(pool, 'Liquidity')
          .withArgs(
            maturity1,
            user1,
            user2,
            daiReserves.sub(await daiFromOwner.balanceOf(pool.address)),
            0,
            lpTokensIn.mul(-1),
          )

        const expectedDaiOut = burnForDai(
          daiReserves,
          fyDaiReservesVirtual,
          fyDaiReservesReal,
          supply,
          lpTokensIn,
          timeTillMaturity
        )

        const daiOut = daiReserves.sub(await dai.balanceOf(pool.address))

        almostEqual(daiOut, expectedDaiOut, daiOut.div(10000))
      })

      it('sells dai', async () => {
        const daiReserves = await poolFromOwner.getBaseTokenReserves()
        const fyDaiReserves = await poolFromOwner.getFYTokenReserves()
        const daiIn = WAD

        
        const timeTillMaturity = maturity1.sub(await currentTimestamp())

        expect(await fyDai1FromOwner.balanceOf(user2)).to.equal(
          0,
          "'User2' wallet should have no fyDai, instead has " + (await fyDai1.balanceOf(user2))
        )

        // Test preview since we are here
        const fyDaiOutPreview = await poolFromOwner.sellBaseTokenPreview(daiIn)

        const expectedFYDaiOut = sellDai(
          daiReserves,
          fyDaiReserves,
          daiIn,
          timeTillMaturity
        )

        await daiFromOwner.mint(user1, daiIn)
        await daiFromUser1.approve(pool.address, daiIn)

        await expect(poolFromUser1.sellBaseToken(user1, user2, daiIn, OVERRIDES))
        .to.emit(pool, 'Trade')
        .withArgs(
          maturity1,
          user1,
          user2,
          daiIn.mul(-1),
          await fyDai1FromOwner.balanceOf(user2),
        )

        const fyDaiOut = await fyDai1FromOwner.balanceOf(user2)

        expect(await daiFromOwner.balanceOf(user1)).to.equal(0, "'From' wallet should have no dai tokens")

        almostEqual(fyDaiOut, expectedFYDaiOut, daiIn.div(1000000))
        almostEqual(fyDaiOutPreview, expectedFYDaiOut, daiIn.div(1000000))
      })

      it('buys fyDai', async () => {
        const daiReserves = await poolFromOwner.getBaseTokenReserves()
        const fyDaiReserves = await poolFromOwner.getFYTokenReserves()
        const fyDaiOut = WAD
        
        const timeTillMaturity = maturity1.sub(await currentTimestamp())

        expect(await fyDai1FromOwner.balanceOf(user2)).to.equal(
          0,
          "'User2' wallet should have no fyDai, instead has " + (await fyDai1FromOwner.balanceOf(user2))
        )

        // Test preview since we are here
        const daiInPreview = await poolFromOwner.buyFYTokenPreview(fyDaiOut)

        const expectedDaiIn = buyFYDai(
          daiReserves,
          fyDaiReserves,
          fyDaiOut,
          timeTillMaturity
        )

        await daiFromOwner.mint(user1, daiTokens)
        const daiBalanceBefore = await daiFromOwner.balanceOf(user1)

        await daiFromUser1.approve(poolFromUser1.address, daiTokens)
        await expect(poolFromUser1.buyFYToken(user1, user2, fyDaiOut, OVERRIDES))
          .to.emit(pool, 'Trade')
          .withArgs(
            maturity1,
            user1,
            user2,
            daiBalanceBefore.sub(await daiFromOwner.balanceOf(user1)).mul(-1),
            fyDaiOut,
          )

        const daiIn = daiBalanceBefore.sub(await daiFromOwner.balanceOf(user1))

        expect(await fyDai1FromOwner.balanceOf(user2)).to.equal(fyDaiOut, "'User2' wallet should have 1 fyDai token")

        almostEqual(daiIn, expectedDaiIn, daiIn.div(1000000))
        almostEqual(daiInPreview, expectedDaiIn, daiIn.div(1000000))
      })

      it("once mature, doesn't allow trading", async () => {
        await timeMachine.advanceTimeAndBlock(ethers.provider, 31556952)

        await expect(poolFromUser1.sellBaseTokenPreview(WAD)).to.be.revertedWith('Pool: Too late')
        await expect(poolFromUser1.sellBaseToken(user1, user2, WAD)).to.be.revertedWith('Pool: Too late')
        await expect(poolFromUser1.buyBaseTokenPreview(WAD)).to.be.revertedWith('Pool: Too late')
        await expect(poolFromUser1.buyBaseToken(user1, user2, WAD)).to.be.revertedWith('Pool: Too late')
        await expect(poolFromUser1.sellFYTokenPreview(WAD)).to.be.revertedWith('Pool: Too late')
        await expect(poolFromUser1.sellFYToken(user1, user2, WAD)).to.be.revertedWith('Pool: Too late')
        await expect(poolFromUser1.buyFYTokenPreview(WAD)).to.be.revertedWith('Pool: Too late')
        await expect(poolFromUser1.buyFYToken(user1, user2, WAD)).to.be.revertedWith('Pool: Too late')
      })
    })
  })
})
