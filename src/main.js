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
const ENEMY_BULLET_SPEED = 200 // Slower than player bullets
const ENEMY_HORIZONTAL_SPEED = 30 // Start slow
const ENEMY_DOWN_STEP = 20 // Small downward step when hitting edge
const ENEMY_SPEED_INCREASE = 2 // Small speed increase each reversal
const ENEMY_SHOOT_INTERVAL = 5000 // 5 seconds in milliseconds
const PLAYER_SHOOT_INTERVAL = 1000 // 1 second in milliseconds
const ENEMY_ROWS = 5
const ENEMY_COLS = 6
const ENEMY_SPACING = 50 // Reduced spacing to keep enemies closer together
const BULLET_WIDTH = 5
const BULLET_HEIGHT = 15

const gameStartDiv = document.querySelector('#gameStartDiv')
const gameStartBtn = document.querySelector('#gameStartBtn')
const gameEndDiv = document.querySelector('#gameEndDiv')
const gameEndScoreSpan = document.querySelector('#gameEndScoreSpan')

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
    this.lives = 3
    this.livesText
    this.enemyDirection = 1 // 1 for right, -1 for left
    this.enemySpeed = ENEMY_HORIZONTAL_SPEED
    this.gameActive = false
    this.enemyShootTimer = 0
    this.playerShootTimer = 0
    this.rowsCanShoot = new Set() // Track which rows can shoot
    this.rowShooting = null // Track which row is currently shooting (to prevent two in same row)
    this.playerHitProcessing = false // Prevent multiple simultaneous hits
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
    this.load.image('explosion', '/public/assets/explosion.png')
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
    // Position player at bottom 1/4 of screen (3/4 from top)
    const playerY = sizes.height * 0.75
    this.player = this.physics.add
      .image(sizes.width / 2, playerY, 'player')
      .setOrigin(0.5, 0.5)
      .setCollideWorldBounds(true)
      .setScale(scale * 0.75) // Scale relative to resolution
    
    this.player.body.allowGravity = false
  }

  createEnemies() {
    // No group - handle each enemy as an individual instance
    this.enemies = []

    // Calculate padding to ensure enemies don't touch screen edges
    // We'll use a minimum padding of 50 pixels on each side
    const sidePadding = 20
    // Calculate the total width needed for the formation (spacing between enemies)
    const formationWidth = (ENEMY_COLS - 1) * ENEMY_SPACING
    // Center the formation with padding on both sides
    const startX = sidePadding + (sizes.width - formationWidth - (sidePadding * 2)) / 2
    // Row 0 (bottom row, closest to player) spawns at 10% from top
    const bottomRowY = sizes.height * 0.1

    // Pre-generate random super alien positions for each row (one per row)
    const superAlienPositions = []
    for (let row = 0; row < ENEMY_ROWS; row++) {
      // Randomly select one column per row to be a super alien
      superAlienPositions[row] = Phaser.Math.Between(0, ENEMY_COLS - 1)
    }

    for (let row = 0; row < ENEMY_ROWS; row++) {
      for (let col = 0; col < ENEMY_COLS; col++) {
        const x = startX + col * ENEMY_SPACING
        // Row 0 is bottom row (closest to player), spawns at bottomRowY (10% from top)
        // Higher row numbers are higher up (smaller y values)
        const y = bottomRowY - row * 50
        
        // Determine if this is a super alien - one random position per row
        const isSuperAlien = superAlienPositions[row] === col
        const enemyKey = isSuperAlien ? 'superAlien' : 'alien'
        
        // Create image with physics directly
        const enemy = this.physics.add.image(x, y, enemyKey)
          .setOrigin(0.5, 0.5)
          .setScale(scale * 0.75) // Scale relative to resolution
        
        // Configure physics body to prevent falling (same as player)
        enemy.body.setGravityY(0)
        enemy.body.allowGravity = false
        enemy.body.setVelocity(0, 0)
        enemy.body.setCollideWorldBounds(false)
        // Let Phaser automatically calculate body size from scaled sprite (like player)
        
        // Set custom properties
        enemy.isAlive = true
        enemy.row = row // Store row index for shooting logic
        enemy.isSuperAlien = isSuperAlien
        enemy.lastShotTime = 0 // Track when this enemy last shot
        
        // Add to array only - no group
        this.enemies.push(enemy)
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
    // Set up overlaps for each enemy individually (enemies is an array, not a group)
    this.enemies.forEach(enemy => {
      if (enemy && enemy.active) {
        this.physics.add.overlap(
          this.playerBullets,
          enemy,
          this.hitEnemy,
          null,
          this
        )
      }
    })

    // Enemy bullets hitting player (simple group vs single object)
    this.playerOverlap = this.physics.add.overlap(
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
    
    // Score in top left
    this.scoreText = this.add.text(10, 10, 'Score: 0', {
      font: `${fontSize}px Arial`,
      fill: '#FFFFFF',
      stroke: '#000000',
      strokeThickness: strokeThickness
    })
    
    // Lives in top right
    this.livesText = this.add.text(sizes.width - 10, 10, 'Lives: 3', {
      font: `${fontSize}px Arial`,
      fill: '#FFFFFF',
      stroke: '#000000',
      strokeThickness: strokeThickness
    }).setOrigin(1, 0) // Right align
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
    if (!this.player) return
    
    if (this.input && this.input.activePointer && this.input.activePointer.isDown) {
      const mouseX = this.input.activePointer.x
      const playerHalfWidth = (this.player.width * this.player.scaleX) / 2
      const clampedX = Phaser.Math.Clamp(mouseX, playerHalfWidth, sizes.width - playerHalfWidth)
      
      // Set position directly on x property instead of using setX
      this.player.x = clampedX
    }
  }

  handlePlayerShooting() {
    if (!this.time) return
    if (!this.player) return
    
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
        // Add to group first
        this.playerBullets.add(bullet)
        // Ensure body is enabled and configured
        if (bullet.body) {
          bullet.body.enable = true
          bullet.body.setSize(BULLET_WIDTH, BULLET_HEIGHT)
          bullet.body.setVelocityY(-BULLET_SPEED)
          bullet.body.allowGravity = false
          bullet.body.setGravityY(0)
        }
      }
    }
  }

  handleEnemyMovement() {
    if (this.enemies.length === 0) return

    let shouldMoveDown = false
    let shouldReverse = false
    let edgeMargin = 30 // Margin from edge to trigger reverse

    // Group enemies by row and find leftmost/rightmost enemies in each row
    const enemiesByRow = {}
    for (let enemy of this.enemies) {
      if (!enemy.isAlive) continue
      
      if (!enemiesByRow[enemy.row]) {
        enemiesByRow[enemy.row] = []
      }
      enemiesByRow[enemy.row].push(enemy)
    }

    // Check only the leftmost and rightmost enemies of each row
    for (let row in enemiesByRow) {
      const rowEnemies = enemiesByRow[row]
      if (rowEnemies.length === 0) continue

      // Find leftmost and rightmost enemies in this row
      let leftmostEnemy = rowEnemies[0]
      let rightmostEnemy = rowEnemies[0]
      
      for (let enemy of rowEnemies) {
        if (enemy.x < leftmostEnemy.x) {
          leftmostEnemy = enemy
        }
        if (enemy.x > rightmostEnemy.x) {
          rightmostEnemy = enemy
        }
      }

      // Account for scaled enemy size
      const leftmostHalfWidth = (leftmostEnemy.width * leftmostEnemy.scaleX) / 2
      const rightmostHalfWidth = (rightmostEnemy.width * rightmostEnemy.scaleX) / 2

      // Check rightmost enemy when moving right
      if (this.enemyDirection === 1 && rightmostEnemy.x + rightmostHalfWidth >= sizes.width - edgeMargin) {
        shouldMoveDown = true
        shouldReverse = true
        break
      }
      // Check leftmost enemy when moving left
      else if (this.enemyDirection === -1 && leftmostEnemy.x - leftmostHalfWidth <= edgeMargin) {
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
      
      // Move down only when hitting edge (discrete step, not velocity)
      // Do this BEFORE setting velocity to ensure position is updated
      if (shouldMoveDown) {
        enemy.y += ENEMY_DOWN_STEP
      }
      
      // Only set horizontal velocity - enemies should NOT fall down
      // Ensure body exists and is enabled
      if (enemy.body) {
        // Ensure body is enabled
        if (!enemy.body.enable) {
          enemy.body.enable = true
        }
        
        // Set horizontal velocity using sprite methods (consistent with game start)
        enemy.setVelocityX(this.enemyDirection * this.enemySpeed)
        enemy.setVelocityY(0) // Explicitly set Y to 0
        enemy.body.setGravityY(0) // Ensure gravity is 0
        enemy.body.allowGravity = false // Ensure gravity is disabled
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
        // Add to group first
        this.enemyBullets.add(bullet1)
        // Ensure body is enabled and configured
        if (bullet1.body) {
          bullet1.body.enable = true
          bullet1.body.setSize(BULLET_WIDTH, BULLET_HEIGHT)
          bullet1.body.setVelocityY(ENEMY_BULLET_SPEED)
          bullet1.body.allowGravity = false
          bullet1.body.setGravityY(0)
        }
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
        // Add to group first
        this.enemyBullets.add(bullet2)
        // Ensure body is enabled and configured
        if (bullet2.body) {
          bullet2.body.enable = true
          bullet2.body.setSize(BULLET_WIDTH, BULLET_HEIGHT)
          bullet2.body.setVelocityY(ENEMY_BULLET_SPEED)
          bullet2.body.allowGravity = false
          bullet2.body.setGravityY(0)
        }
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
        // Add to group first
        this.enemyBullets.add(bullet)
        // Ensure body is enabled and configured
        if (bullet.body) {
          bullet.body.enable = true
          bullet.body.setSize(BULLET_WIDTH, BULLET_HEIGHT)
          bullet.body.setVelocityY(ENEMY_BULLET_SPEED)
          bullet.body.allowGravity = false
          bullet.body.setGravityY(0)
        }
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
    // Check if bullet and enemy are valid
    if (!bullet || !bullet.active) return
    if (!enemy || !enemy.active) return

    // Destroy bullet immediately to prevent hitting multiple enemies
    bullet.destroy()
    
    // Store enemy position and type before destroying
    const enemyX = enemy.x
    const enemyY = enemy.y
    const isSuper = enemy.isSuperAlien

    // Create explosion particle effect at enemy position
    this.createExplosion(enemyX, enemyY)

    // Destroy enemy sprite
    enemy.setVisible(false)
    enemy.destroy()

    // Remove from enemies array
    const index = this.enemies.indexOf(enemy)
    if (index > -1) {
      this.enemies.splice(index, 1)
    }

    // Update score based on enemy type
    const points = isSuper ? 7 : 5
    this.updateScore(points)
  }

  hitPlayer(bullet, player) {
    console.log('[hitPlayer] Called - lives:', this.lives, 'bullet.active:', bullet?.active, 'this.player exists:', !!this.player, 'processing:', this.playerHitProcessing)
    
    // Prevent multiple simultaneous hits
    if (this.playerHitProcessing) {
      console.log('[hitPlayer] Already processing hit, returning')
      return
    }
    
    // Check if bullet is valid
    if (!bullet || !bullet.active) {
      console.log('[hitPlayer] Bullet invalid, returning')
      return
    }
    // Check if player exists and has lives left
    if (!this.player) {
      console.log('[hitPlayer] this.player is null, returning')
      return
    }
    if (this.lives <= 0) {
      console.log('[hitPlayer] Lives <= 0, returning')
      return
    }
    
    // Set processing flag IMMEDIATELY to prevent multiple calls
    this.playerHitProcessing = true
    console.log('[hitPlayer] Processing hit - current lives:', this.lives)

    // Store THIS player state before destroying bullet (this.player is the actual displayed sprite)
    const playerWasVisible = this.player.visible
    const playerWasActive = this.player.active
    const playerScene = this.player.scene
    const playerDisplayList = this.player.displayList
    
    // Store player position for explosion BEFORE destroying bullet
    const playerX = this.player.x
    const playerY = this.player.y
    
    // Destroy bullet IMMEDIATELY to prevent multiple overlap triggers
    if (this.enemyBullets && this.enemyBullets.contains(bullet)) {
      this.enemyBullets.remove(bullet, false, false)
    }
    bullet.destroy()
    
    // Check if this.player was removed from scene/display list and re-add it
    if (!this.player.scene || !this.player.displayList) {
      // Re-add this.player to scene if it was removed
      if (playerScene) {
        playerScene.add.existing(this.player)
        // Re-add to physics world if needed
        if (!this.player.body || !this.player.body.world) {
          playerScene.physics.add.existing(this.player)
        }
        // Re-enable physics body
        if (this.player.body) {
          this.player.body.enable = true
        }
        // Re-setup collision for player (overlap might be broken after re-adding)
        // Remove old overlap if it exists to avoid duplicates
        if (this.playerOverlap) {
          this.physics.world.removeCollider(this.playerOverlap)
        }
        this.playerOverlap = this.physics.add.overlap(
          this.enemyBullets,
          this.player,
          this.hitPlayer,
          null,
          this
        )
        console.log('[hitPlayer] Re-added player to scene and re-setup overlap')
      }
    }
    
    // Immediately restore THIS player state (bullet.destroy() is affecting this.player somehow)
    this.player.setVisible(playerWasVisible)
    this.player.setActive(playerWasActive)
    if (this.player.body) {
      this.player.body.enable = true
    }
    console.log('[hitPlayer] After restore - player.visible:', this.player.visible, 'player.active:', this.player.active)

    // Create explosion particle effect at player position
    console.log('[hitPlayer] Creating explosion at:', playerX, playerY)
    this.createExplosion(playerX, playerY)
    console.log('[hitPlayer] Explosion created')

    // Reduce lives
    console.log('[hitPlayer] Before lives reduction - lives:', this.lives)
    this.lives--
    console.log('[hitPlayer] After lives reduction - lives:', this.lives)
    this.updateLives()
    console.log('[hitPlayer] Lives updated in UI')

    // Check if game over
    if (this.lives <= 0) {
      console.log('[hitPlayer] Game over - calling gameOver()')
      this.gameOver()
    }
    
    // Reset processing flag after a longer delay to prevent rapid multiple hits
    this.time.delayedCall(500, () => {
      this.playerHitProcessing = false
      console.log('[hitPlayer] Processing flag reset')
    })
    
    console.log('[hitPlayer] Function complete')
  }

  // ========================================
  // GAME STATE METHODS
  // ========================================

  updateScore(points) {
    this.score += points
    this.scoreText.setText(`Score: ${this.score}`)
  }

  updateLives() {
    this.livesText.setText(`Lives: ${this.lives}`)
  }

  createExplosion(x, y) {
    // Create a particle emitter for explosion effect
    const particles = this.add.particles(x, y, 'explosion', {
      speed: { min: 50, max: 150 },
      scale: { start: 0.5, end: 0 },
      lifespan: 500,
      quantity: 10,
      blendMode: 'ADD'
    })
    
    // Destroy particles after animation
    this.time.delayedCall(500, () => {
      if (particles && particles.active) {
        particles.destroy()
      }
    })
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
      debug: true // Enable debug to show collision boxes
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
    // Set game active - this will allow update loop to run
    gameScene.gameActive = true
    
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
      gameScene.enemies.forEach((enemy) => {
        if (enemy.isAlive && enemy.body) {
          // Ensure body is enabled
          if (!enemy.body.enable) {
            enemy.body.enable = true
          }
          
          // Set velocity using sprite methods (same as in handleEnemyMovement)
          enemy.setVelocityX(gameScene.enemyDirection * gameScene.enemySpeed)
          enemy.setVelocityY(0) // Ensure no vertical movement
        }
      })
    }
  }
})


