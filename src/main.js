import './style.css'
import Phaser from 'phaser'

// Function to get current browser dimensions
function getBrowserDimensions() {
  const width = window.innerWidth || document.documentElement.clientWidth || document.body.clientWidth
  const height = window.innerHeight || document.documentElement.clientHeight || document.body.clientHeight
  return { width, height }
}

// Initialize sizes - will be updated when DOM is ready
let sizes = getBrowserDimensions()

// Calculate scaling factors based on original 1080x1920 resolution
let scaleX = sizes.width / 1080
let scaleY = sizes.height / 1920
let scale = Math.min(scaleX, scaleY) // Use the smaller scale to maintain aspect ratio

// Function to update dimensions and scale
function updateDimensions() {
  sizes = getBrowserDimensions()
  scaleX = sizes.width / 1080
  scaleY = sizes.height / 1920
  scale = Math.min(scaleX, scaleY)
}

// Game parameters
const PLAYER_SPEED = 300
const BULLET_SPEED = 500
const ENEMY_BULLET_SPEED = 200 // Slower than player bullets
const ENEMY_HORIZONTAL_SPEED = 30 // Start slow
const ENEMY_DOWN_STEP = 20 // Small downward step when hitting edge
const ENEMY_SHOOT_INTERVAL = 5000 // 5 seconds in milliseconds
const PLAYER_SHOOT_INTERVAL = 750 // 0.75 second in milliseconds
const ENEMY_ROWS = 5
const ENEMY_COLS = 6
const ENEMY_SPACING = 50 // Reduced spacing to keep enemies closer together
const BULLET_WIDTH = 5
const BULLET_HEIGHT = 15

// ========================================
// DIFFICULTY CONFIGURATION
// ========================================
// Percentage of eligible enemies that will shoot (0.0 to 1.0)
// Example: 0.3 means 30% of enemies that can shoot will actually shoot
const DIFFICULTY_ENEMY_SHOOT_PERCENTAGE = 0.1

// Speed increase when enemies reverse direction (descent speed increase)
// This value is added to enemy speed each time they hit an edge and reverse
const DIFFICULTY_ENEMY_SPEED_INCREASE = 0.5

// Number of super aliens per row
// Starts at 1, increases by 1 every time the threshold is reached
// Number of spawned lines before super alien count increases by 1
const DIFFICULTY_SUPER_ALIENS_INCREASE_AFTER_LINES = 5

// Power-up configuration
const POWERUP_SPAWN_AFTER_ROWS = 10 // Spawn power-up after this many rows
const POWERUP_DURATION = 10000 // Power-up duration in milliseconds (10 seconds)
const POWERUP_SIZE = 20 // Size of the power-up box

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
    this.lastSpawnedRowY = null // Track Y position of the last spawned row
    this.nextRowIndex = 0 // Track the next row index to spawn
    this.lastSpawnCheckY = null // Track Y position when we last checked for spawning
    this.rowLastShotTime = new Map() // Track when each row last shot (for staggered shooting)
    this.minTimeBetweenRowShots = 800 // Minimum time between different rows shooting (in ms)
    this.spawnedRowCount = 0 // Track how many rows have been spawned (for super alien logic)
    this.powerUp = null // Current power-up on screen
    this.playerDoubleShot = false // Whether player has double shot power-up active
    this.powerUpEndTime = 0 // When the power-up expires
    this.lastPowerUpSpawnRow = 0 // Track which row count we last spawned a power-up at
  }

  // ========================================
  // MAIN PHASER LIFECYCLE METHODS
  // ========================================
  
  preload() {
    // In Vite, files in the 'public' folder are served from root
    // So '/public/assets/...' should be '/assets/...'
    // This works in both development and production builds
    
    // Load background
    this.load.image('bg', '/assets/cryptoBgd.png')
    
    // Load game sprites
    this.load.image('player', '/assets/player.png')
    this.load.image('alien', '/assets/alien.png')
    this.load.image('superAlien', '/assets/super_alien.png')
    this.load.image('explosion', '/assets/explosion.png')
  }

  create() {
    // Don't pause the scene - control with gameActive instead
    
    // Ensure physics world has no gravity
    this.physics.world.gravity.y = 0
    this.physics.world.gravity.x = 0
    
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

    // Pre-generate random super alien positions for each row (one per row initially)
    const superAlienPositions = []
    for (let row = 0; row < ENEMY_ROWS; row++) {
      // Randomly select one column per row to be a super alien
      superAlienPositions[row] = [Phaser.Math.Between(0, ENEMY_COLS - 1)]
    }

    for (let row = 0; row < ENEMY_ROWS; row++) {
      this.spawnEnemyRow(row, startX, bottomRowY, superAlienPositions[row])
    }
    
    // Track the last spawned row Y position (topmost row)
    this.lastSpawnedRowY = bottomRowY - (ENEMY_ROWS - 1) * 50
    this.nextRowIndex = ENEMY_ROWS
    
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

  spawnEnemyRow(rowIndex, startX, bottomRowY, superAlienPositions) {
    // Calculate Y position for this row
    // Row 0 is bottom row (closest to player), spawns at bottomRowY (10% from top)
    // Higher row numbers are higher up (smaller y values)
    const y = bottomRowY - rowIndex * 50
    
    // Handle super alien positions - can be array or single value
    const superAlienCols = Array.isArray(superAlienPositions) 
      ? superAlienPositions 
      : (superAlienPositions !== undefined ? [superAlienPositions] : [Phaser.Math.Between(0, ENEMY_COLS - 1)])
    
    for (let col = 0; col < ENEMY_COLS; col++) {
      const x = startX + col * ENEMY_SPACING
      
      // Determine if this is a super alien - check if col is in superAlienCols array
      const isSuperAlien = superAlienCols.includes(col)
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
      enemy.row = rowIndex // Store row index for shooting logic
      enemy.isSuperAlien = isSuperAlien
      enemy.lastShotTime = 0 // Track when this enemy last shot
      
      // Add to array only - no group
      this.enemies.push(enemy)
    }
    
    // Update last spawned row Y position
    this.lastSpawnedRowY = y
  }

  spawnEnemyRowCentered(rowIndex, startX, y, superAlienPositions) {
    // Spawn a row at a specific Y position with proper centering
    // Handle super alien positions - should be an array
    const superAlienCols = Array.isArray(superAlienPositions) 
      ? superAlienPositions 
      : (superAlienPositions !== undefined ? [superAlienPositions] : [Phaser.Math.Between(0, ENEMY_COLS - 1)])
    
    for (let col = 0; col < ENEMY_COLS; col++) {
      const x = startX + col * ENEMY_SPACING
      
      // Determine if this is a super alien - check if col is in superAlienCols array
      const isSuperAlien = superAlienCols.includes(col)
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
      
      // Set custom properties
      enemy.isAlive = true
      enemy.row = rowIndex // Store row index for shooting logic
      enemy.isSuperAlien = isSuperAlien
      enemy.lastShotTime = 0 // Track when this enemy last shot
      
      // Add to array only - no group
      this.enemies.push(enemy)
    }
    
    // Update last spawned row Y position
    this.lastSpawnedRowY = y
  }

  createBullets() {
    // Create groups for bullets - we'll create physics rectangles when shooting
    this.playerBullets = this.physics.add.group()
    this.enemyBullets = this.physics.add.group()
  }

  spawnPowerUp() {
    // Don't spawn if there's already a power-up on screen
    if (this.powerUp && this.powerUp.active) return
    
    // Spawn power-up at player's Y level, random X position
    const playerY = this.player.y
    const powerUpX = Phaser.Math.Between(POWERUP_SIZE, sizes.width - POWERUP_SIZE)
    
    // Create white box power-up
    this.powerUp = this.add.rectangle(
      powerUpX,
      playerY,
      POWERUP_SIZE,
      POWERUP_SIZE,
      0xffffff, // White
      1
    )
    
    // Add physics to power-up
    this.physics.add.existing(this.powerUp)
    if (this.powerUp.body) {
      this.powerUp.body.enable = true
      this.powerUp.body.setSize(POWERUP_SIZE, POWERUP_SIZE)
      this.powerUp.body.setVelocity(0, 0) // Power-up doesn't move
      this.powerUp.body.allowGravity = false
    }
    
    // Setup collision with player
    this.physics.add.overlap(
      this.player,
      this.powerUp,
      this.collectPowerUp,
      null,
      this
    )
    
    // Add pulsing animation to make it more visible
    this.tweens.add({
      targets: this.powerUp,
      alpha: 0.5,
      duration: 500,
      yoyo: true,
      repeat: -1
    })
  }

  collectPowerUp(player, powerUp) {
    if (!powerUp || !powerUp.active) return
    
    // Destroy the power-up
    powerUp.destroy()
    this.powerUp = null
    
    // Activate double shot
    this.playerDoubleShot = true
    this.powerUpEndTime = this.time.now + POWERUP_DURATION
    
    // Visual feedback (optional - could add sound or text here)
  }

  checkPowerUpExpiration() {
    if (this.playerDoubleShot && this.time.now >= this.powerUpEndTime) {
      this.playerDoubleShot = false
    }
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
    this.checkSpawnNewRow()
    this.checkPowerUpExpiration()
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
      
      // Shoot automatically (limit based on double shot)
      const maxBullets = this.playerDoubleShot ? 6 : 3 // Allow more bullets with double shot
      const activeBullets = this.playerBullets.children.size
      
      if (this.playerDoubleShot) {
        // Double shot - shoot two bullets side by side
        if (activeBullets < maxBullets) {
          // First bullet (left)
          const bullet1 = this.add.rectangle(
            this.player.x - 10, 
            this.player.y - (this.player.height * this.player.scaleY) / 2 - 10, 
            BULLET_WIDTH, 
            BULLET_HEIGHT, 
            0xffffff, // White player bullets 
            1
          )
          this.physics.add.existing(bullet1)
          this.playerBullets.add(bullet1)
          if (bullet1.body) {
            bullet1.body.enable = true
            bullet1.body.setSize(BULLET_WIDTH, BULLET_HEIGHT)
            bullet1.body.setVelocityY(-BULLET_SPEED)
            bullet1.body.allowGravity = false
            bullet1.body.setGravityY(0)
          }
          
          // Second bullet (right) - only if we have room
          if (activeBullets + 1 < maxBullets) {
            const bullet2 = this.add.rectangle(
              this.player.x + 10, 
              this.player.y - (this.player.height * this.player.scaleY) / 2 - 10, 
              BULLET_WIDTH, 
              BULLET_HEIGHT, 
              0xffffff, // White player bullets 
              1
            )
            this.physics.add.existing(bullet2)
            this.playerBullets.add(bullet2)
            if (bullet2.body) {
              bullet2.body.enable = true
              bullet2.body.setSize(BULLET_WIDTH, BULLET_HEIGHT)
              bullet2.body.setVelocityY(-BULLET_SPEED)
              bullet2.body.allowGravity = false
              bullet2.body.setGravityY(0)
            }
          }
        }
      } else {
        // Single shot
        if (activeBullets < maxBullets) {
          // Create a rectangular bullet - create rectangle first, then enable physics
          const bullet = this.add.rectangle(
            this.player.x, 
            this.player.y - (this.player.height * this.player.scaleY) / 2 - 10, 
            BULLET_WIDTH, 
            BULLET_HEIGHT, 
            0xffffff, // White player bullets 
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
      this.enemySpeed += DIFFICULTY_ENEMY_SPEED_INCREASE // Increase speed based on difficulty setting
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
      // Reset all rows to be able to shoot - check all rows dynamically
      this.rowsCanShoot.clear()
      // Get all unique row indices from alive enemies
      const aliveEnemyRows = new Set()
      for (let enemy of this.enemies) {
        if (enemy.isAlive) {
          aliveEnemyRows.add(enemy.row)
        }
      }
      // Add all rows with alive enemies
      aliveEnemyRows.forEach(row => {
        this.rowsCanShoot.add(row)
      })
      this.rowShooting = null // Reset current shooting row
    }

    // Only allow one row to shoot at a time (prevents two in same row)
    if (this.rowShooting !== null) return

    // Find enemies that can shoot (in rows that can shoot and haven't shot recently)
    const enemiesReadyToShoot = this.enemies.filter(enemy => {
      if (!enemy || !enemy.isAlive) return false
      if (!enemy.active) return false // Check if enemy is still active (not destroyed)
      if (!this.rowsCanShoot.has(enemy.row)) return false
      
      // Check if this row shot recently (staggered shooting)
      const lastShotTime = this.rowLastShotTime.get(enemy.row) || 0
      const timeSinceRowShot = currentTime - lastShotTime
      if (timeSinceRowShot < this.minTimeBetweenRowShots) {
        return false // This row shot too recently
      }
      
      return true
    })

    if (enemiesReadyToShoot.length > 0) {
      // Apply difficulty percentage: only allow a percentage of eligible enemies to shoot
      const numEnemiesThatCanShoot = Math.max(1, Math.floor(enemiesReadyToShoot.length * DIFFICULTY_ENEMY_SHOOT_PERCENTAGE))
      
      // Randomly select from eligible enemies based on percentage
      // Shuffle the array to randomize which enemies can shoot
      const shuffledEnemies = [...enemiesReadyToShoot]
      for (let i = shuffledEnemies.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffledEnemies[i], shuffledEnemies[j]] = [shuffledEnemies[j], shuffledEnemies[i]]
      }
      const enemiesToChooseFrom = shuffledEnemies.slice(0, numEnemiesThatCanShoot)
      
      // Pick a random enemy from the filtered list
      const shootingEnemy = Phaser.Utils.Array.GetRandom(enemiesToChooseFrom)
      this.rowShooting = shootingEnemy.row
      
      // Record when this row shot
      this.rowLastShotTime.set(shootingEnemy.row, currentTime)
      
      // Shoot from this enemy
      this.shootFromEnemy(shootingEnemy)
      
      // Reset rowShooting after a delay to allow other rows to shoot
      // Use a longer delay to ensure staggered shooting
      this.time.delayedCall(this.minTimeBetweenRowShots, () => {
        this.rowShooting = null
      })
    }
  }

  shootFromEnemy(enemy) {
    // Check if enemy is still valid before shooting
    if (!enemy || !enemy.active || !enemy.isAlive) return
    
    // Calculate bullet spawn position at the bottom of the enemy sprite
    // Enemy origin is 0.5, 0.5, so enemy.y is the center
    const enemyHeight = enemy.height * enemy.scaleY
    const bulletSpawnY = enemy.y + (enemyHeight / 2) + 5 // Spawn just below the enemy sprite
    
    if (enemy.isSuperAlien) {
      // Super alien shoots double shot
      // First bullet
      if (this.enemyBullets.children.size < 28) {
        const bullet1 = this.add.rectangle(
          enemy.x - 10, 
          bulletSpawnY, 
          BULLET_WIDTH, 
          BULLET_HEIGHT, 
          0xff0000, // Red enemy bullets 
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
          bulletSpawnY, 
          BULLET_WIDTH, 
          BULLET_HEIGHT, 
          0xff0000, // Red enemy bullets 
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
          bulletSpawnY, 
          BULLET_WIDTH, 
          BULLET_HEIGHT, 
          0xff0000, // Red enemy bullets 
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

  checkSpawnNewRow() {
    // Only spawn new rows if player still has lives
    if (this.lives <= 0) return
    if (this.lastSpawnedRowY === null) return
    
    // Find the topmost alive enemy to determine the last spawned row position
    let topmostEnemyY = null
    for (let enemy of this.enemies) {
      if (!enemy || !enemy.isAlive || !enemy.active) continue
      if (topmostEnemyY === null || enemy.y < topmostEnemyY) {
        topmostEnemyY = enemy.y
      }
    }
    
    // If no alive enemies, don't spawn
    if (topmostEnemyY === null) return
    
    // Spawn new row 50 pixels above the topmost row to maintain same spacing as original rows
    // We spawn when the topmost row is 100 pixels above the top of the screen (Y = -100)
    const spawnThreshold = -100 // Spawn when topmost row reaches 100 pixels above screen top
    const rowSpacing = 50 // Same spacing as original rows (50 pixels between rows)
    
    // Check if we should spawn: topmost row is at or above the threshold (100 pixels above screen)
    // This ensures we always have enemies near the top of the screen
    const shouldSpawn = topmostEnemyY >= spawnThreshold && 
                       (this.lastSpawnCheckY === null || topmostEnemyY > this.lastSpawnCheckY)
    
    if (shouldSpawn) {
      // Get the startX from an existing enemy to ensure perfect alignment
      // Find the leftmost enemy in the topmost row to get the exact startX
      let leftmostEnemy = null
      for (let enemy of this.enemies) {
        if (!enemy.isAlive) continue
        if (Math.abs(enemy.y - topmostEnemyY) < 1) { // Allow small floating point differences
          if (leftmostEnemy === null || enemy.x < leftmostEnemy.x) {
            leftmostEnemy = enemy
          }
        }
      }
      
      // Calculate startX using the same method as initial spawn
      // If we found a reference enemy, we can verify alignment, but use calculation for consistency
      const sidePadding = 20
      const formationWidth = (ENEMY_COLS - 1) * ENEMY_SPACING
      let startX = sidePadding + (sizes.width - formationWidth - (sidePadding * 2)) / 2
      
      // If we have a reference enemy, use its position to ensure perfect alignment
      // Find which column the leftmost enemy is in and adjust startX accordingly
      if (leftmostEnemy) {
        // Find all enemies in the topmost row to determine column positions
        const topRowEnemies = []
        for (let enemy of this.enemies) {
          if (!enemy.isAlive) continue
          if (Math.abs(enemy.y - topmostEnemyY) < 1) {
            topRowEnemies.push(enemy)
          }
        }
        
        // Sort by X position to find the leftmost
        topRowEnemies.sort((a, b) => a.x - b.x)
        
        if (topRowEnemies.length > 0) {
          // Use the leftmost enemy's X position as the reference
          // Calculate what startX should be based on the leftmost enemy's position
          // The leftmost enemy should be at startX (column 0)
          startX = topRowEnemies[0].x
        }
      }
      
      // Spawn new row 50 pixels above the topmost row to maintain same spacing as original rows
      const newRowY = topmostEnemyY - rowSpacing
      
      // Determine number of super aliens based on spawned row count and difficulty settings
      // Starts at 1, increases by 1 every time the threshold is reached
      // Example: if threshold is 5, then lines 0-4 have 1, lines 5-9 have 2, lines 10-14 have 3, etc.
      const numSuperAliens = 1 + Math.floor(this.spawnedRowCount / DIFFICULTY_SUPER_ALIENS_INCREASE_AFTER_LINES)
      
      // Generate random super alien positions for this row
      // Use a proper shuffle to ensure truly random positions
      const superAlienPositions = []
      const availableCols = Array.from({length: ENEMY_COLS}, (_, i) => i)
      
      // Shuffle the available columns array to randomize selection
      for (let i = availableCols.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [availableCols[i], availableCols[j]] = [availableCols[j], availableCols[i]]
      }
      
      // Take the first numSuperAliens columns from the shuffled array
      for (let i = 0; i < numSuperAliens && i < availableCols.length; i++) {
        superAlienPositions.push(availableCols[i])
      }
      
      // Spawn the new row with proper centering
      this.spawnEnemyRowCentered(this.nextRowIndex, startX, newRowY, superAlienPositions)
      
      this.lastSpawnedRowY = newRowY
      // Track the topmost enemy Y when we spawned - this helps us know when to spawn again
      // We'll spawn again when the topmost enemy moves down by at least rowSpacing
      this.lastSpawnCheckY = topmostEnemyY
      this.spawnedRowCount++
      
      // Check if we should spawn a power-up (every 10 rows)
      // Only spawn if we haven't already spawned one for this row count
      if (this.spawnedRowCount % POWERUP_SPAWN_AFTER_ROWS === 0 && 
          this.spawnedRowCount !== this.lastPowerUpSpawnRow) {
        this.spawnPowerUp()
        this.lastPowerUpSpawnRow = this.spawnedRowCount
      }
      
      // Add this row to the shooting system
      this.rowsCanShoot.add(this.nextRowIndex)
      
      // Get the newly spawned enemies
      const newRowEnemies = this.enemies.filter(e => e.row === this.nextRowIndex)
      
      // Setup collisions for new enemies
      newRowEnemies.forEach(enemy => {
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
      
      // Set initial velocity for new enemies
      newRowEnemies.forEach(enemy => {
        if (enemy.isAlive && enemy.body) {
          if (!enemy.body.enable) {
            enemy.body.enable = true
          }
          enemy.setVelocityX(this.enemyDirection * this.enemySpeed)
          enemy.setVelocityY(0)
          enemy.body.setGravityY(0)
          enemy.body.allowGravity = false
        }
      })
      
      this.nextRowIndex++
    }
  }

  checkPowerUpSpawn() {
    // Power-up spawning is handled in checkSpawnNewRow when rows are spawned
    // This method is called in update loop but doesn't need to do anything here
    // as spawning is triggered by row spawning
  }

  checkGameOver() {
    // Check if any enemy reached player's line
    // Player is at 75% from top (sizes.height * 0.75) with origin at center (0.5, 0.5)
    // So player.y is the center of the sprite
    if (!this.player) return
    
    const playerY = this.player.y // Use actual player Y position
    const playerHeight = this.player.height * this.player.scaleY
    // Player bottom = center + half height
    const playerBottom = playerY + (playerHeight / 2)
    // Game over when enemy reaches near the bottom of the player (with small margin)
    const gameOverThreshold = playerBottom - 10 // 10 pixels margin above player bottom
    
    for (let enemy of this.enemies) {
      if (!enemy.isAlive) continue
      if (!enemy.active) continue
      // Check if enemy has reached the player's area
      // Since enemy origin is also 0.5, 0.5, enemy.y is center, so check enemy bottom
      const enemyHeight = enemy.height * enemy.scaleY
      const enemyBottom = enemy.y + (enemyHeight / 2)
      if (enemyBottom >= gameOverThreshold) {
        this.gameOver()
        return
      }
    }

    // No win condition - enemies keep spawning until player loses all lives
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
    
    // Check if this row still has alive enemies, if not, remove from shooting system
    const rowHasAliveEnemies = this.enemies.some(e => e.isAlive && e.active && e.row === enemy.row)
    if (!rowHasAliveEnemies) {
      this.rowsCanShoot.delete(enemy.row)
    }

    // Update score based on enemy type
    const points = isSuper ? 7 : 5
    this.updateScore(points)
  }

  hitPlayer(bullet, player) {
    // Prevent multiple simultaneous hits
    if (this.playerHitProcessing) {
      return
    }
    
    // Check if bullet is valid
    if (!bullet || !bullet.active) {
      return
    }
    // Check if player exists and has lives left
    if (!this.player) {
      return
    }
    if (this.lives <= 0) {
      return
    }
    
    // Set processing flag IMMEDIATELY to prevent multiple calls
    this.playerHitProcessing = true

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
      }
    }
    
    // Immediately restore THIS player state (bullet.destroy() is affecting this.player somehow)
    this.player.setVisible(playerWasVisible)
    this.player.setActive(playerWasActive)
    if (this.player.body) {
      this.player.body.enable = true
    }

    // Create explosion particle effect at player position
    this.createExplosion(playerX, playerY)

    // Reduce lives
    this.lives--
    this.updateLives()

    // Check if game over
    if (this.lives <= 0) {
      this.gameOver()
    }
    
    // Reset processing flag after a longer delay to prevent rapid multiple hits
    this.time.delayedCall(500, () => {
      this.playerHitProcessing = false
    })
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

// Wait for DOM to be ready before initializing game
// This ensures we get the correct browser dimensions
function initializeGame() {
  // Update dimensions right before creating the game
  updateDimensions()
  
  // Get canvas element
  const gameCanvas = document.querySelector('#gameCanvas')
  if (!gameCanvas) {
    return
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
  })
  
  // Also try to get scene immediately if available
  if (game && game.scene) {
    gameScene = game.scene.getScene('gameScene')
  }
  
  // Handle window resize events
  window.addEventListener('resize', () => {
    updateDimensions()
    // Note: Phaser doesn't automatically resize
    // If dynamic resizing is needed, we can add game.scale.resize() here
  })
  
  return { game, gameScene }
}

// Initialize game when DOM is ready
// Use multiple strategies to ensure we get correct dimensions
let game, gameScene

function initGameWhenReady() {
  // Update dimensions one more time right before initialization
  // This ensures we have the most up-to-date viewport size
  updateDimensions()
  
  const result = initializeGame()
  if (result) {
    game = result.game
    gameScene = result.gameScene
  }
}

if (document.readyState === 'loading') {
  // Wait for DOM to be ready
  document.addEventListener('DOMContentLoaded', () => {
    // Use a small delay to ensure viewport is fully calculated
    setTimeout(initGameWhenReady, 100)
  })
  
  // Also listen for window load as a fallback (ensures all resources loaded)
  window.addEventListener('load', () => {
    if (!game) {
      initGameWhenReady()
    }
  })
} else {
  // DOM is already ready
  // Use a small delay to ensure viewport is fully calculated
  setTimeout(initGameWhenReady, 100)
}

// Set up game start button event listener
// Wait for DOM to ensure elements are available
function setupGameStartButton() {
  if (!gameStartBtn) {
    return
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
}

// Set up event listener when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupGameStartButton)
} else {
  setupGameStartButton()
}


