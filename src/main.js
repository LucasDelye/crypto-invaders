import './style.css'
import Phaser from 'phaser'

const sizes = {
  width: window.innerWidth,
  height: window.innerHeight
}

// Calculate scaling factors based on original 1080x1920 resolution
const scaleX = sizes.width / 1080
const scaleY = sizes.height / 1920
const scale = Math.min(scaleX, scaleY) // Use the smaller scale to maintain aspect ratio

const speedDown = 500

const gameStartDiv = document.querySelector('#gameStartDiv')
const gameStartBtn = document.querySelector('#gameStartBtn')
const gameEndDiv = document.querySelector('#gameEndDiv')
const gameEndScoreSpan = document.querySelector('#gameEndScoreSpan')
const gameWinLoseSpan = document.querySelector('#gameWinLoseSpan')

class GameScene extends Phaser.Scene {
  constructor() {
    super('gameScene')
    this.player
    this.cursor
    this.targets = []
    this.bonusTargets = []
    this.penaltyTargets = []
    this.playerSpeed = speedDown + 50
    this.points = 0
    this.lives = 3
    this.textScore
    this.textLives
    this.coinMusic
    this.bgMusic
    this.successEmitter
    this.penaltyEmitter
    this.targetCount = 1
    this.targetSpawnCounter = 0
    this.penaltySpawnCounter = 0
    this.hitTargets = new Set() // Track hit targets by their Phaser object reference
  }

  // ========================================
  // MAIN PHASER LIFECYCLE METHODS
  // ========================================
  
  preload() {
    this.load.image('bg', '/public/assets/cryptoBgd.png')
    this.load.image('wallet', '/public/assets/wallet.png')
    this.load.image('coin', '/public/assets/coin.png')
    this.load.image('bonusCoin', '/public/assets/bonusCoin.png')
    this.load.image('penaltyTarget', '/public/assets/penaltyCoin.png') // Using money sprite as penalty target
    this.load.image('money', '/public/assets/money.png')
    this.load.image('success', '/public/assets/success.png')
    this.load.image('penalty', '/public/assets/penalty.png')
    
    this.load.audio('coinMusic', '/public/assets/coin.mp3')
    this.load.audio('bgMusic', '/public/assets/bgMusic.mp3')
    this.load.audio('penaltySound', '/public/assets/incorrect.mp3')
  }

  create() {
    this.scene.pause('gameScene')
    this.initializeAudio()
    this.createBackground()
    this.createPlayer()
    this.createInitialTargets()
    this.setupCollisions()
    this.createUI()
    this.createParticles()
  }

  update(){
    this.handleTargetSpawning()
    this.handlePlayerMovement()
  }

  // ========================================
  // GAME SETUP HELPER METHODS
  // ========================================

  initializeAudio() {
    this.coinMusic = this.sound.add('coinMusic')
    this.bgMusic = this.sound.add('bgMusic')
    this.penaltySound = this.sound.add('penaltySound')
    this.bgMusic.play()
  }

  createBackground() {
    const bg = this.add.image(0, 0, 'bg').setOrigin(0, 0)
    
    // Calculate scale to ensure full height coverage
    const bgScaleY = sizes.height / bg.height
    const bgScaleX = sizes.width / bg.width
    
    // Use the larger scale to ensure full coverage, prioritizing height
    const bgScale = Math.max(bgScaleX, bgScaleY)
    
    bg.setScale(bgScale)
  }

  createPlayer() {
    this.player = this.physics.add
      .image(sizes.width / 2, sizes.height * (2/3) - (100 * scale), 'wallet')
      .setOrigin(0.5, 0)
      .setCollideWorldBounds(true)
      .setScale(scale)
      
    this.player.setSize(this.player.width - this.player.width/4, this.player.height/3)
      .setOffset(this.player.width/10, this.player.height - this.player.height/3)
    this.player.body.allowGravity = false
  }

  createInitialTargets() {
    // Create initial targets
    console.log('Creating initial targets, count:', this.targetCount)
    for(let i = 0; i < this.targetCount; i++) {
      this.createTarget()
    }
    console.log('Total targets created:', this.targets.length)
  }

  createTarget() {
    const target = this.physics.add
      .image(0, 0, 'coin')
      .setOrigin(0, 0)
      .setScale(scale)
      .setMaxVelocity(0, speedDown)
    
    target.setY(0)
    target.setX(this.getRandomX())
    target.targetType = 'regular'
    this.targets.push(target)
    
    console.log('Created target', this.targets.length, 'at position:', target.x, target.y)
    
    // Set up collision detection for this target
    this.setupTargetCollision(target)
    
    // Check if we should spawn a bonus target (1 in 5 chance)
    if(this.shouldSpawnBonusTarget() && this.targets.length + this.bonusTargets.length + this.penaltyTargets.length < 10) {
      this.createBonusTarget()
    }
    
    // Check if we should spawn a penalty target (1 in 6 chance)
    if(this.shouldSpawnPenaltyTarget() && this.targets.length + this.bonusTargets.length + this.penaltyTargets.length < 10 && this.penaltyTargets.length < 3) {
      this.createPenaltyTarget()
    }
    
    return target
  }

  createBonusTarget() {
    const bonusTarget = this.physics.add
      .image(0, 0, 'bonusCoin')
      .setOrigin(0, 0)
      .setScale(scale) // Same size as regular coins
      .setMaxVelocity(0, speedDown)
    
    bonusTarget.setY(0)
    bonusTarget.setX(this.getRandomX())
    bonusTarget.targetType = 'bonus'
    this.bonusTargets.push(bonusTarget)
    
    // Set up collision detection for this bonus target
    this.setupBonusTargetCollision(bonusTarget)
    
    return bonusTarget
  }

  createPenaltyTarget() {
    const penaltyTarget = this.physics.add
      .image(0, 0, 'penaltyTarget')
      .setOrigin(0, 0)
      .setScale(scale) // Same size as regular coins
      .setMaxVelocity(0, speedDown)
    
    penaltyTarget.setY(0)
    penaltyTarget.setX(this.getRandomX())
    penaltyTarget.targetType = 'penalty'
    this.penaltyTargets.push(penaltyTarget)
    
    // Set up collision detection for this penalty target
    this.setupPenaltyTargetCollision(penaltyTarget)
    
    return penaltyTarget
  }

  setupCollisions() {
    // Set up collision detection for all existing targets
    this.targets.forEach(target => {
      this.setupTargetCollision(target)
    })
    
    this.bonusTargets.forEach(bonusTarget => {
      this.setupBonusTargetCollision(bonusTarget)
    })
    
    this.penaltyTargets.forEach(penaltyTarget => {
      this.setupPenaltyTargetCollision(penaltyTarget)
    })
  }

  setupTargetCollision(target) {
    this.physics.add.overlap(target, this.player, this.targetHit, null, this)
  }

  setupBonusTargetCollision(bonusTarget) {
    this.physics.add.overlap(bonusTarget, this.player, this.bonusTargetHit, null, this)
  }

  setupPenaltyTargetCollision(penaltyTarget) {
    this.physics.add.overlap(penaltyTarget, this.player, this.penaltyTargetHit, null, this)
  }

  createUI() {
    // Calculate responsive font size based on screen width
    const fontSize = Math.max(20, Math.min(35, sizes.width / 30))
    const strokeThickness = Math.max(1, Math.min(3, sizes.width / 400))
    
    this.textScore = this.add.text(sizes.width - (sizes.width * 0.25), 10, 'Score: 0', {
      font: `${fontSize}px Arial`,
      fill: "#FFFFFF",
      stroke: "#000000",
      strokeThickness: strokeThickness
    })

    this.textLives = this.add.text(10, 10, 'Lives: 3', {
      font: `${fontSize}px Arial`,
      fill: '#FFFFFF',
      stroke: "#000000",
      strokeThickness: strokeThickness
    })
  }

  createParticles() {
    // Success particles for regular and bonus coins
    this.successEmitter = this.add.particles(0, 0, 'success', {
      speed: 100,
      gravityY: speedDown - 200,
      scale: 0.04,
      duration: 100,
      emitting: false
    })
    this.successEmitter.startFollow(this.player, this.player.width / 2, this.player.height / 2, true)
    
    // Penalty particles for penalty coins
    this.penaltyEmitter = this.add.particles(0, 0, 'penalty', {
      speed: 100,
      gravityY: speedDown - 200,
      scale: 0.04,
      duration: 100,
      emitting: false
    })
    this.penaltyEmitter.startFollow(this.player, this.player.width / 2, this.player.height / 2, true)
  }


  // ========================================
  // GAME UPDATE HELPER METHODS
  // ========================================


  handleTargetSpawning() {
    // Check regular targets that fell off screen
    this.targets.forEach((target, index) => {
      if(target.y > sizes.height) {
        this.targets.splice(index, 1)
        target.destroy()
        
        // Create new target if under limit
        if(this.targets.length + this.bonusTargets.length + this.penaltyTargets.length < 10) {
          this.createTarget()
        }
      }
    })
    
    // Check bonus targets that fell off screen
    this.bonusTargets.forEach((bonusTarget, index) => {
      if(bonusTarget.y > sizes.height) {
        this.bonusTargets.splice(index, 1)
        bonusTarget.destroy()
        
        // Create new bonus target if under limit
        if(this.targets.length + this.bonusTargets.length + this.penaltyTargets.length < 10) {
          this.createBonusTarget()
        }
      }
    })
    
    // Check penalty targets that fell off screen
    this.penaltyTargets.forEach((penaltyTarget, index) => {
      if(penaltyTarget.y > sizes.height) {
        this.penaltyTargets.splice(index, 1)
        penaltyTarget.destroy()
        
        // Create new penalty target if under limit
        if(this.targets.length + this.bonusTargets.length + this.penaltyTargets.length < 10 && this.penaltyTargets.length < 3) {
          this.createPenaltyTarget()
        }
      }
    })
    
    // Spawn new targets based on difficulty (respecting limit)
    this.updateTargetCount()
  }

  handlePlayerMovement() {
    if(this.input.activePointer.isDown){
      const mouseX = this.input.activePointer.x
      this.player.setX(mouseX)
    }
  }

  // ========================================
  // GAME LOGIC HELPER METHODS
  // ========================================

  // Bonus target spawning logic moved to createTarget method
  shouldSpawnBonusTarget() {
    this.targetSpawnCounter++
    if(this.targetSpawnCounter >= 5) {
      this.targetSpawnCounter = 0
      return true
    }
    return false
  }

  // Penalty target spawning logic
  shouldSpawnPenaltyTarget() {
    this.penaltySpawnCounter++
    if(this.penaltySpawnCounter >= 6) {
      this.penaltySpawnCounter = 0
      return true
    }
    return false
  }

  getRandomX(){
    return Math.random() * (sizes.width - (100 * scale))
  }

  updateTargetCount() {
    // Gradually increase target count based on score
    const newTargetCount = Math.min(Math.floor(this.points / 10) + 1, 10) // Max 10 targets total
    
    if(newTargetCount > this.targetCount) {
      // Add new targets only if under the limit
      const currentTotal = this.targets.length + this.bonusTargets.length + this.penaltyTargets.length
      const targetsToAdd = Math.min(newTargetCount - this.targetCount, 10 - currentTotal)
      
      for(let i = 0; i < targetsToAdd; i++) {
        this.createTarget()
      }
      this.targetCount = newTargetCount
    }
  }

  targetHit(target, player){
    console.log('Target hit! Target object:', target, 'Player:', player)
    
    this.coinMusic.play()
    this.successEmitter.start()
    this.updateScore(1)
    console.log('Scoring 1 point, destroying target immediately')
    
    // Immediately destroy and remove target
    const targetIndex = this.targets.indexOf(target)
    if(targetIndex !== -1) {
      this.targets.splice(targetIndex, 1)
    }
    target.destroy()
    
    // Create a new target to replace it (if under limit)
    if(this.targets.length + this.bonusTargets.length + this.penaltyTargets.length < 10) {
      this.createTarget()
    }
  }

  bonusTargetHit(bonusTarget, player){
    console.log('Bonus target hit! Target object:', bonusTarget, 'Player:', player)
    
    this.coinMusic.play()
    this.successEmitter.start()
    this.updateScore(3)
    console.log('Scoring 3 points, destroying bonus target immediately')
    
    // Immediately destroy and remove bonus target
    const bonusIndex = this.bonusTargets.indexOf(bonusTarget)
    if(bonusIndex !== -1) {
      this.bonusTargets.splice(bonusIndex, 1)
    }
    bonusTarget.destroy()
    
    // Create a new bonus target to replace it (if under limit)
    if(this.targets.length + this.bonusTargets.length + this.penaltyTargets.length < 10) {
      this.createBonusTarget()
    }
  }

  penaltyTargetHit(penaltyTarget, player){
    console.log('Penalty target hit! Target object:', penaltyTarget, 'Player:', player)
    
    this.penaltySound.play()
    this.penaltyEmitter.start()
    this.loseLife() // Lose a life instead of subtracting points
    console.log('Penalty! Lost a life, destroying penalty target immediately')
    
    // Immediately destroy and remove penalty target
    const penaltyIndex = this.penaltyTargets.indexOf(penaltyTarget)
    if(penaltyIndex !== -1) {
      this.penaltyTargets.splice(penaltyIndex, 1)
    }
    penaltyTarget.destroy()
    
    // Create a new penalty target to replace it (if under limit)
    if(this.targets.length + this.bonusTargets.length + this.penaltyTargets.length < 10 && this.penaltyTargets.length < 3) {
      this.createPenaltyTarget()
    }
  }

  updateScore(points = 1) {
    this.points += points
    this.textScore.setText(`Score: ${this.points}`)
    this.updateTargetCount() // Update target count based on score
  }

  loseLife() {
    this.lives--
    this.textLives.setText(`Lives: ${this.lives}`)
    
    if (this.lives <= 0) {
      this.gameOver()
    }
  }

  gameOver() {
    this.sys.game.destroy(true)
    this.displayGameResults()
  }

  displayGameResults() {
    gameEndScoreSpan.textContent = this.points
    gameWinLoseSpan.textContent = `Final Score: ${this.points}`
    gameEndDiv.style.display = 'flex'
  }

}

const config = {
  type: Phaser.WEBGL,
  width: sizes.width,
  height: sizes.height,
  canvas: gameCanvas,
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: speedDown },
      debug:true
    }
  },
  scene: [GameScene]
}

const game = new Phaser.Game(config)

gameStartBtn.addEventListener('click', () => {
  gameStartDiv.style.display = 'none'
  game.scene.resume('gameScene')
})