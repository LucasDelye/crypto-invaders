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

// Game parameters
const PLAYER_SPEED = 300
const BULLET_SPEED = 500
const ENEMY_BULLET_SPEED = 400
const ENEMY_HORIZONTAL_SPEED = 30 // Start slow
const ENEMY_DOWN_STEP = 20 // Small downward step when hitting edge
const ENEMY_SPEED_INCREASE = 2 // Small speed increase each reversal
const ENEMY_SHOOT_INTERVAL = 5000 // 5 seconds in milliseconds
const PLAYER_SHOOT_INTERVAL = 1000 // 1 second in milliseconds
const ENEMY_ROWS = 5
const ENEMY_COLS = 10
const ENEMY_SPACING = 60
const BULLET_WIDTH = 5
const BULLET_HEIGHT = 15

const gameStartDiv = document.querySelector('#gameStartDiv')
const gameStartBtn = document.querySelector('#gameStartBtn')
const gameEndDiv = document.querySelector('#gameEndDiv')
const gameEndScoreSpan = document.querySelector('#gameEndScoreSpan')
const gameRetryBtn = document.querySelector('#gameRetryBtn')

class GameScene extends Phaser.Scene {
  constructor() {
    super('gameScene')
    this.player
    this.cursors
    this.spaceKey
    this.enemies = []
    this.playerBullets
    this.enemyBullets
    this.score = 0
    this.scoreText
    this.enemyDirection = 1 // 1 for right, -1 for left
    this.enemySpeed = ENEMY_HORIZONTAL_SPEED
    this.gameActive = false
    this.enemyShootTimer = 0
    this.playerShootTimer = 0
    this.rowsCanShoot = new Set() // Track which rows can shoot
    this.rowShooting = null // Track which row is currently shooting (to prevent two in same row)
  }

  // ========================================
  // MAIN PHASER LIFECYCLE METHODS
  // ========================================
  
  preload() {
    // Load background
    this.load.image('bg', '/public/assets/cryptoBgd.png')
    
    // Load game sprites
    this.load.image('player', '/public/assets/player.png')
    this.load.image('alien', '/public/assets/alien.png')
    this.load.image('superAlien', '/public/assets/super_alien.png')
  }

  create() {
    // Don't pause the scene - control with gameActive instead
    
    // Ensure physics world has no gravity
    this.physics.world.gravity.y = 0
    this.physics.world.gravity.x = 0
    console.log('Scene created - Physics world gravity:', this.physics.world.gravity)
    
    this.createBackground()
    this.createPlayer()
    this.createEnemies()
    this.createBullets()
    this.setupCollisions()
    this.createUI()
    this.setupInput()
    this.createStarfield()
  }

  createBackground() {
    // Try to load background image, fallback to black if not available
    try {
      const bg = this.add.image(0, 0, 'bg').setOrigin(0, 0)
      const bgScaleY = sizes.height / bg.height
      const bgScaleX = sizes.width / bg.width
      const bgScale = Math.max(bgScaleX, bgScaleY)
      bg.setScale(bgScale)
    } catch (e) {
      // Fallback to black background
      this.add.rectangle(0, 0, sizes.width, sizes.height, 0x000000).setOrigin(0, 0)
    }
  }

  createStarfield() {
    // Simple starfield effect
    for (let i = 0; i < 50; i++) {
      const x = Phaser.Math.Between(0, sizes.width)
      const y = Phaser.Math.Between(0, sizes.height)
      const star = this.add.circle(x, y, 1, 0xffffff, 0.8)
      this.tweens.add({
        targets: star,
        alpha: 0.2,
        duration: Phaser.Math.Between(1000, 3000),
        yoyo: true,
        repeat: -1
      })
    }
  }

  createPlayer() {
    this.player = this.physics.add
      .image(sizes.width / 2, sizes.height - 50, 'player')
      .setOrigin(0.5, 0.5)
      .setCollideWorldBounds(true)
      .setScale(scale * 0.45) // Scale relative to resolution
    
    this.player.body.allowGravity = false
  }

  createEnemies() {
    // No group - handle each enemy as an individual instance
    this.enemies = []

    const startX = (sizes.width - (ENEMY_COLS * ENEMY_SPACING)) / 2
    const startY = 100

    for (let row = 0; row < ENEMY_ROWS; row++) {
      for (let col = 0; col < ENEMY_COLS; col++) {
        const x = startX + col * ENEMY_SPACING
        const y = startY + row * 50
        
        // Determine if this is a super alien (e.g., every 3rd enemy or specific pattern)
        // Based on the image description, super aliens appear randomly in the formation
        // Let's make it so every 5th enemy is a super alien, or we can use a pattern
        const isSuperAlien = (row * ENEMY_COLS + col) % 5 === 0
        const enemyKey = isSuperAlien ? 'superAlien' : 'alien'
        
        // Create image with physics directly
        const enemy = this.physics.add.image(x, y, enemyKey)
          .setOrigin(0.5, 0.5)
          .setScale(scale * 0.45) // Scale relative to resolution
        
        // CRITICAL: Check position immediately after creation (only log first enemy)
        const isFirstEnemy = row === 0 && col === 0
        if (isFirstEnemy) {
          console.log(`[CREATE] Enemy [${row},${col}] - After physics.add.image: sprite(${enemy.x}, ${enemy.y}), body(${enemy.body.x}, ${enemy.body.y})`)
        }
        
        // Configure physics body to prevent falling
        enemy.body.setGravityY(0) // Explicitly set gravity to 0
        enemy.body.allowGravity = false
        enemy.body.setVelocity(0, 0) // Initialize with zero velocity
        enemy.body.setCollideWorldBounds(false) // Don't collide with world bounds (we handle edges manually)
        
        // CRITICAL: Manually set body size and position to match sprite exactly
        // Calculate the actual display size (width * scale)
        const displayWidth = enemy.width * enemy.scaleX
        const displayHeight = enemy.height * enemy.scaleY
        
        // Set body size to match the scaled sprite
        enemy.body.setSize(displayWidth, displayHeight)
        
        // Since origin is 0.5,0.5, the body center should be at the sprite center
        // Calculate body position: sprite position minus half the body size
        const bodyX = x - (displayWidth / 2)
        const bodyY = y - (displayHeight / 2)
        
        // Set body position directly
        enemy.body.x = bodyX
        enemy.body.y = bodyY
        
        // Also reset to ensure everything is synced
        enemy.body.reset(x, y)
        
        // Store the intended positions
        enemy.intendedY = y
        enemy.intendedX = x
        
        if (isFirstEnemy) {
          console.log(`[CREATE] Enemy [${row},${col}] - After body.reset: sprite(${enemy.x}, ${enemy.y}), body(${enemy.body.x}, ${enemy.body.y}), intended: (${x}, ${y})`)
        }
        
        // Set custom properties
        enemy.isAlive = true
        enemy.row = row // Store row index for shooting logic
        enemy.isSuperAlien = isSuperAlien
        enemy.lastShotTime = 0 // Track when this enemy last shot
        
        // Add to array only - no group
        this.enemies.push(enemy)
        
        // Final check after adding to array (only log first enemy)
        if (isFirstEnemy) {
          console.log(`[CREATE] Enemy [${row},${col}] - After push: sprite(${enemy.x}, ${enemy.y}), body(${enemy.body.x}, ${enemy.body.y})`)
        }
      }
    }
    
    // Initialize all rows as able to shoot
    for (let i = 0; i < ENEMY_ROWS; i++) {
      this.rowsCanShoot.add(i)
    }
    
    // Initialize enemy shoot timer to allow immediate shooting
    // Set it to a time in the past so the first shot happens quickly
    if (this.time) {
      this.enemyShootTimer = this.time.now - ENEMY_SHOOT_INTERVAL + 1000 // Allow shooting after 1 second
    }
  }

  createBullets() {
    // Create groups for bullets - we'll create physics rectangles when shooting
    this.playerBullets = this.physics.add.group()
    this.enemyBullets = this.physics.add.group()
  }

  setupCollisions() {
    // Initialize overlap arrays if they don't exist
    if (!this.playerBulletOverlaps) {
      this.playerBulletOverlaps = []
    }
    
    // Clear any existing overlaps
    if (this.playerBulletOverlaps.length > 0) {
      this.playerBulletOverlaps.forEach(overlap => {
        if (overlap && overlap.world) {
          overlap.world.removeCollider(overlap)
        }
      })
      this.playerBulletOverlaps = []
    }
    
    // Set up overlaps for each enemy individually
    this.enemies.forEach(enemy => {
      if (enemy && enemy.active && enemy.isAlive) {
        const overlap = this.physics.add.overlap(
          this.playerBullets,
          enemy,
          this.hitEnemy,
          null,
          this
        )
        this.playerBulletOverlaps.push(overlap)
      }
    })

    // Enemy bullets hitting player
    this.physics.add.overlap(
      this.enemyBullets,
      this.player,
      this.hitPlayer,
      null,
      this
    )
  }

  createUI() {
    const fontSize = Math.max(20, Math.min(35, sizes.width / 30))
    const strokeThickness = Math.max(1, Math.min(3, sizes.width / 400))
    
    this.scoreText = this.add.text(10, 10, 'Score: 0', {
      font: `${fontSize}px Arial`,
      fill: '#FFFFFF',
      stroke: '#000000',
      strokeThickness: strokeThickness
    })
  }

  setupInput() {
    this.cursors = this.input.keyboard.createCursorKeys()
    this.spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE)
    
    // Also support A/D keys
    this.aKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A)
    this.dKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D)
    
    // Track if space was just pressed (to prevent holding)
    this.spaceJustPressed = false
  }

  update() {
    if (!this.gameActive) return

    // Debug: Check if positions are being reset in the first few frames
    if (this.enemies && this.enemies.length > 0) {
      const firstEnemy = this.enemies[0]
      if (firstEnemy && firstEnemy.body && firstEnemy.isAlive) {
        // Check if body position is 0 or doesn't match sprite
        if (firstEnemy.body.y === 0 || Math.abs(firstEnemy.body.y - firstEnemy.y) > 1) {
          console.error(`[UPDATE FIRST CHECK] Enemy body.y is ${firstEnemy.body.y}, sprite.y is ${firstEnemy.y}! Fixing immediately.`)
          firstEnemy.body.reset(firstEnemy.x, firstEnemy.y)
        }
      }
    }

    this.handlePlayerMovement()
    this.handlePlayerShooting()
    this.handleEnemyMovement()
    this.handleEnemyShooting()
    this.cleanupBullets()
    this.checkGameOver()
  }

  // ========================================
  // GAME UPDATE HELPER METHODS
  // ========================================

  handlePlayerMovement() {
    if (this.input && this.input.activePointer && this.input.activePointer.isDown) {
      const mouseX = this.input.activePointer.x
      const playerHalfWidth = (this.player.width * this.player.scaleX) / 2
      const clampedX = Phaser.Math.Clamp(mouseX, playerHalfWidth, sizes.width - playerHalfWidth)
      this.player.setX(clampedX)
    }
  }

  handlePlayerShooting() {
    if (!this.time) return
    
    const currentTime = this.time.now
    
    // Initialize timer if it's 0 or not set
    if (!this.playerShootTimer || this.playerShootTimer === 0) {
      this.playerShootTimer = currentTime
    }
    
    // Check if 1 second has passed since last shot
    const timeSinceLastShot = currentTime - this.playerShootTimer
    if (timeSinceLastShot >= PLAYER_SHOOT_INTERVAL) {
      this.playerShootTimer = currentTime
      
      // Shoot automatically (limit to 3 bullets on screen)
      const activeBullets = this.playerBullets.children.size
      if (activeBullets < 3) {
        // Create a rectangular bullet - create rectangle first, then enable physics
        const bullet = this.add.rectangle(
          this.player.x, 
          this.player.y - (this.player.height * this.player.scaleY) / 2 - 10, 
          BULLET_WIDTH, 
          BULLET_HEIGHT, 
          0x00ffff, 
          1
        )
        this.physics.add.existing(bullet)
        bullet.body.setVelocityY(-BULLET_SPEED)
        bullet.body.allowGravity = false
        this.playerBullets.add(bullet)
      }
    }
  }

  handleEnemyMovement() {
    if (this.enemies.length === 0) return

    let shouldMoveDown = false
    let shouldReverse = false
    let edgeMargin = 30 // Margin from edge to trigger reverse

    // Check if any enemy hits the edge
    for (let enemy of this.enemies) {
      if (!enemy.isAlive) continue
      
      // Account for scaled enemy size
      const enemyHalfWidth = (enemy.width * enemy.scaleX) / 2
      
      if (this.enemyDirection === 1 && enemy.x + enemyHalfWidth >= sizes.width - edgeMargin) {
        shouldMoveDown = true
        shouldReverse = true
        break
      } else if (this.enemyDirection === -1 && enemy.x - enemyHalfWidth <= edgeMargin) {
        shouldMoveDown = true
        shouldReverse = true
        break
      }
    }

    if (shouldReverse) {
      this.enemyDirection *= -1
      this.enemySpeed += ENEMY_SPEED_INCREASE // Increase speed slightly each time they reverse
    }

    // Move all alive enemies - only horizontal movement, no vertical velocity
    for (let enemy of this.enemies) {
      if (!enemy.isAlive) continue
      
      // Debug: Log enemy state periodically (only first enemy to avoid spam)
      const isFirstEnemy = this.enemies.indexOf(enemy) === 0
      if (isFirstEnemy && Math.random() < 0.01) {
        console.log('[MOVE] Enemy state - y:', enemy.y, 'body.y:', enemy.body.y, 'velocity:', enemy.body.velocity)
      }
      
      // Debug: Check if Y is changing unexpectedly
      if (isFirstEnemy && enemy.y > sizes.height - 200) {
        console.warn('[MOVE] Enemy Y position is too low!', enemy.y, 'body.y:', enemy.body.y, 'velocity:', enemy.body.velocity)
      }
      
      // Move down only when hitting edge (discrete step, not velocity)
      // Do this BEFORE setting velocity to ensure position is updated
      if (shouldMoveDown) {
        enemy.y += ENEMY_DOWN_STEP
      }
      
      // Only set horizontal velocity - enemies should NOT fall down
      // Use body.setVelocity to explicitly set both X and Y
      if (enemy.body && enemy.body.enable) {
        // CRITICAL: Phaser syncs sprite to body, so we need to keep body position correct
        // Calculate expected body position based on sprite position and size
        const displayHeight = enemy.height * enemy.scaleY
        const expectedBodyY = enemy.y - (displayHeight / 2)
        const bodyYDiff = Math.abs(enemy.body.y - expectedBodyY)
        
        const isFirstEnemy = this.enemies.indexOf(enemy) === 0
        
        // If body position doesn't match expected, fix it BEFORE setting velocity
        if ((enemy.body.y === 0 && enemy.y !== 0) || bodyYDiff > 1) {
          if (isFirstEnemy) {
            console.error(`[UPDATE] Body desync! sprite.y: ${enemy.y}, body.y: ${enemy.body.y}, expected body.y: ${expectedBodyY}, diff: ${bodyYDiff}`)
          }
          
          // CRITICAL: Manually set body position to match sprite
          // Calculate body position based on sprite center and body size
          const displayWidth = enemy.width * enemy.scaleX
          enemy.body.x = enemy.x - (displayWidth / 2)
          enemy.body.y = enemy.y - (displayHeight / 2)
          
          // Also call reset to ensure Phaser's internal state is updated
          enemy.body.reset(enemy.x, enemy.y)
          
          if (isFirstEnemy) {
            console.log(`[UPDATE] After fix - sprite.y: ${enemy.y}, body.y: ${enemy.body.y}, expected: ${expectedBodyY}`)
          }
        }
        
        // Force Y velocity to 0 every frame - do this AFTER position fix
        enemy.body.setVelocity(this.enemyDirection * this.enemySpeed, 0) // X velocity only, Y always 0
        enemy.body.setVelocityY(0) // Explicitly set Y to 0
        enemy.body.setGravityY(0) // Ensure gravity is 0
        enemy.body.allowGravity = false // Ensure gravity is disabled
        
        // Debug: Check if Y velocity is being set incorrectly
        if (enemy.body.velocity.y !== 0) {
          if (isFirstEnemy) {
            console.warn('[UPDATE] Enemy Y velocity is not 0!', enemy.body.velocity.y, 'Forcing to 0')
          }
          enemy.body.setVelocityY(0)
        }
      }
    }
  }

  handleEnemyShooting() {
    if (!this.time || this.enemies.length === 0) return
    
    const currentTime = this.time.now
    
    // Initialize timer if it's 0 or not set
    if (!this.enemyShootTimer || this.enemyShootTimer === 0) {
      this.enemyShootTimer = currentTime - ENEMY_SHOOT_INTERVAL + 1000 // Allow shooting after 1 second
    }
    
    // Update shoot timer - every 5 seconds, allow all rows to shoot again
    const timeSinceLastShot = currentTime - this.enemyShootTimer
    if (timeSinceLastShot >= ENEMY_SHOOT_INTERVAL) {
      this.enemyShootTimer = currentTime
      // Reset all rows to be able to shoot
      this.rowsCanShoot.clear()
      for (let i = 0; i < ENEMY_ROWS; i++) {
        // Only add rows that have alive enemies
        const rowHasAliveEnemies = this.enemies.some(e => e.isAlive && e.row === i)
        if (rowHasAliveEnemies) {
          this.rowsCanShoot.add(i)
        }
      }
      this.rowShooting = null // Reset current shooting row
    }

    // Only allow one row to shoot at a time (prevents two in same row)
    if (this.rowShooting !== null) return

    // Find enemies that can shoot (in rows that can shoot)
    const enemiesReadyToShoot = this.enemies.filter(enemy => {
      if (!enemy.isAlive) return false
      if (!this.rowsCanShoot.has(enemy.row)) return false
      return true
    })

    if (enemiesReadyToShoot.length > 0) {
      // Pick a random enemy from ready enemies
      const shootingEnemy = Phaser.Utils.Array.GetRandom(enemiesReadyToShoot)
      this.rowShooting = shootingEnemy.row
      
      // Shoot from this enemy
      this.shootFromEnemy(shootingEnemy)
      
      // Reset rowShooting after a short delay to allow other rows to shoot
      this.time.delayedCall(100, () => {
        this.rowShooting = null
      })
    }
  }

  shootFromEnemy(enemy) {
    if (enemy.isSuperAlien) {
      // Super alien shoots double shot
      // First bullet
      if (this.enemyBullets.children.size < 28) {
        const bullet1 = this.add.rectangle(
          enemy.x - 10, 
          enemy.y + 20, 
          BULLET_WIDTH, 
          BULLET_HEIGHT, 
          0xffff00, 
          1
        )
        this.physics.add.existing(bullet1)
        bullet1.body.setVelocityY(ENEMY_BULLET_SPEED)
        bullet1.body.allowGravity = false
        this.enemyBullets.add(bullet1)
      }
      
      // Second bullet (slightly offset)
      if (this.enemyBullets.children.size < 29) {
        const bullet2 = this.add.rectangle(
          enemy.x + 10, 
          enemy.y + 20, 
          BULLET_WIDTH, 
          BULLET_HEIGHT, 
          0xffff00, 
          1
        )
        this.physics.add.existing(bullet2)
        bullet2.body.setVelocityY(ENEMY_BULLET_SPEED)
        bullet2.body.allowGravity = false
        this.enemyBullets.add(bullet2)
      }
    } else {
      // Regular alien shoots single bullet
      if (this.enemyBullets.children.size < 29) {
        const bullet = this.add.rectangle(
          enemy.x, 
          enemy.y + 20, 
          BULLET_WIDTH, 
          BULLET_HEIGHT, 
          0xffff00, 
          1
        )
        this.physics.add.existing(bullet)
        bullet.body.setVelocityY(ENEMY_BULLET_SPEED)
        bullet.body.allowGravity = false
        this.enemyBullets.add(bullet)
      }
    }
    
    // Mark this row as having shot (remove from canShoot set)
    this.rowsCanShoot.delete(enemy.row)
  }

  cleanupBullets() {
    // Remove bullets that go off screen
    const playerBulletsToRemove = []
    this.playerBullets.children.entries.forEach(bullet => {
      if (bullet.y < 0) {
        playerBulletsToRemove.push(bullet)
      }
    })
    playerBulletsToRemove.forEach(bullet => bullet.destroy())

    const enemyBulletsToRemove = []
    this.enemyBullets.children.entries.forEach(bullet => {
      if (bullet.y > sizes.height) {
        enemyBulletsToRemove.push(bullet)
      }
    })
    enemyBulletsToRemove.forEach(bullet => bullet.destroy())
  }

  checkGameOver() {
    // Check if any enemy reached player's line
    for (let enemy of this.enemies) {
      if (!enemy.isAlive) continue
      if (enemy.y >= sizes.height - 100) {
        this.gameOver()
        return
      }
    }

    // Check if all enemies are destroyed (win condition - optional)
    const aliveEnemies = this.enemies.filter(e => e.isAlive)
    if (aliveEnemies.length === 0) {
      // Player wins - could spawn new wave or end game
      // For now, we'll just end the game
      this.gameOver()
    }
  }

  // ========================================
  // COLLISION HANDLERS
  // ========================================

  hitEnemy(bullet, enemy) {
    if (!enemy.isAlive) return

    // Destroy enemy
    enemy.isAlive = false
    enemy.setVisible(false)
    enemy.setVelocity(0, 0)
    enemy.body.enable = false

    // Remove from enemies array
    const index = this.enemies.indexOf(enemy)
    if (index > -1) {
      this.enemies.splice(index, 1)
    }

    // Destroy bullet
    bullet.destroy()

    // Update score
    this.updateScore(10)
  }

  hitPlayer(bullet, player) {
    // Destroy bullet
    bullet.destroy()

    // Game over
    this.gameOver()
  }

  // ========================================
  // GAME STATE METHODS
  // ========================================

  updateScore(points) {
    this.score += points
    this.scoreText.setText(`Score: ${this.score}`)
  }

  gameOver() {
    this.gameActive = false
    this.physics.pause()
    this.displayGameResults()
  }

  displayGameResults() {
    gameEndScoreSpan.textContent = this.score
    gameEndDiv.style.display = 'flex'
  }

  restart() {
    // Reset game state
    this.score = 0
    this.enemyDirection = 1
    this.enemySpeed = ENEMY_HORIZONTAL_SPEED
    this.gameActive = true
    this.enemyShootTimer = this.time.now // Initialize to current time
    this.playerShootTimer = this.time.now // Initialize to current time
    this.rowsCanShoot.clear()
    this.rowShooting = null

    // Clear all game objects
    this.playerBullets.clear(true, true)
    this.enemyBullets.clear(true, true)
    
    // Destroy all enemies
    this.enemies.forEach(enemy => {
      if (enemy && enemy.active) {
        enemy.destroy()
      }
    })
    this.enemies = []

    // Reset player position
    this.player.setPosition(sizes.width / 2, sizes.height - 50)
    this.player.setVelocity(0, 0)

    // Recreate enemies
    this.createEnemies()
    this.setupCollisions()

    // Update UI
    this.scoreText.setText('Score: 0')

    // Resume physics
    this.physics.resume()
    
    // Set enemy velocities after restart - only horizontal, no vertical
    if (this.enemies && this.enemies.length > 0) {
      this.enemies.forEach(enemy => {
        if (enemy.isAlive && enemy.body) {
          enemy.setVelocityX(this.enemyDirection * this.enemySpeed)
          enemy.setVelocityY(0) // Ensure no vertical movement
        }
      })
    }
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
      gravity: { y: 0, x: 0 }, // Explicitly set both to 0
      debug: false
    }
  },
  scene: [GameScene]
}

const game = new Phaser.Game(config)

// Get reference to the scene - try multiple ways to ensure we get it
let gameScene

game.events.once('ready', () => {
  gameScene = game.scene.getScene('gameScene')
  console.log('Game ready, scene:', gameScene)
})

// Also try to get scene immediately if available
if (game && game.scene) {
  gameScene = game.scene.getScene('gameScene')
}

gameStartBtn.addEventListener('click', () => {
  gameStartDiv.style.display = 'none'
  
  // Try to get scene if we don't have it yet
  if (!gameScene && game && game.scene) {
    gameScene = game.scene.getScene('gameScene')
  }
  
  if (gameScene) {
    console.log('Starting game, gameActive:', gameScene.gameActive)
    // Set game active - this will allow update loop to run
    gameScene.gameActive = true
    console.log('Set gameActive to true:', gameScene.gameActive)
    
    // Ensure physics is running
    if (gameScene.physics && gameScene.physics.world) {
      gameScene.physics.world.resume()
    }
    
    // Initialize enemy and player shoot timers when game starts
    if (gameScene.time) {
      gameScene.enemyShootTimer = gameScene.time.now - ENEMY_SHOOT_INTERVAL + 1000
      gameScene.playerShootTimer = gameScene.time.now
    }
    
    // Set enemy velocities immediately - only horizontal, no vertical
    if (gameScene.enemies && gameScene.enemies.length > 0) {
      console.log('Setting enemy velocities on game start. Enemy count:', gameScene.enemies.length)
      gameScene.enemies.forEach((enemy, index) => {
        if (enemy.isAlive && enemy.body) {
          const isFirstEnemy = index === 0
          if (isFirstEnemy) {
            console.log(`[START] Enemy ${index} BEFORE - sprite.y: ${enemy.y}, body.y: ${enemy.body.y}, body.position: (${enemy.body.x}, ${enemy.body.y})`)
          }
          
          // CRITICAL: Ensure body position matches sprite position BEFORE setting velocity
          // Use body.reset() to properly sync body with sprite (accounts for origin/scale)
          if (Math.abs(enemy.body.y - enemy.y) > 1) {
            if (isFirstEnemy) {
              console.warn(`[START] Enemy ${index} body position mismatch! sprite.y: ${enemy.y}, body.y: ${enemy.body.y}. Syncing...`)
            }
            enemy.body.reset(enemy.x, enemy.y)
          }
          
          // Now set velocity
          enemy.setVelocityX(gameScene.enemyDirection * gameScene.enemySpeed)
          enemy.setVelocityY(0) // Ensure no vertical movement
          
          if (isFirstEnemy) {
            console.log(`[START] Enemy ${index} AFTER - sprite.y: ${enemy.y}, body.y: ${enemy.body.y}, body.position: (${enemy.body.x}, ${enemy.body.y}), velocity:`, enemy.body.velocity)
          }
        }
      })
    }
  } else {
    console.error('gameScene is not available!')
  }
})

gameRetryBtn.addEventListener('click', () => {
  gameEndDiv.style.display = 'none'
  if (gameScene) {
    gameScene.restart()
  } else {
    // If scene not ready, reload page
    location.reload()
  }
})
