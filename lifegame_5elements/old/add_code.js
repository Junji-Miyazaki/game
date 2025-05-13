// Enhanced Five Elements Life Game - Social Behavior System
// Adding new social behavior components to the existing system

// Add these constants to your existing code:

// Social behavior traits for each element
const SOCIAL_TRAITS = {
    wood: {
        groupOrientation: 0.7,    // Tendency to form groups (0-1)
        leadershipDrive: 0.8,     // Desire to lead (0-1)
        extroversion: 0.7,        // Extroversion vs introversion (0-1)
        stability: 0.5,           // Emotional/behavioral stability (0-1)
        preferredGroupSize: 8,    // Optimal group size
        goalOrientation: 0.9      // Focus on goals and future (0-1)
    },
    fire: {
        groupOrientation: 0.8,
        leadershipDrive: 0.5,
        extroversion: 0.9,
        stability: 0.3,
        preferredGroupSize: 6,
        emotionalExpression: 0.9  // Tendency to express emotions (0-1)
    },
    earth: {
        groupOrientation: 0.9,
        leadershipDrive: 0.3,
        extroversion: 0.5,
        stability: 0.8,
        preferredGroupSize: 5,
        nurturing: 0.9            // Tendency to support others (0-1)
    },
    metal: {
        groupOrientation: 0.3,
        leadershipDrive: 0.5,
        extroversion: 0.4,
        stability: 0.7,
        preferredGroupSize: 4,
        structureNeed: 0.8        // Need for order and structure (0-1)
    },
    water: {
        groupOrientation: 0.2,
        leadershipDrive: 0.2,
        extroversion: 0.2,
        stability: 0.4,
        preferredGroupSize: 3,
        intuition: 0.8            // Intuitive understanding (0-1)
    }
};

// Group representation
class CellGroup {
    constructor(cells = [], type = null) {
        this.cells = cells;
        this.type = type || (cells.length > 0 ? cells[0].type : null);
        this.leader = null;
        this.formationTime = turn;
        this.stability = 0.5; // How stable the group is (0-1)
        this.goalProgress = 0; // Progress toward collective goal
        
        // If there are cells in the group, select a leader
        if (cells.length > 0) {
            this.electLeader();
        }
    }
    
    // Choose a leader based on leadership drive
    electLeader() {
        if (this.cells.length === 0) return null;
        
        let bestCandidate = this.cells[0];
        let highestLeadership = 0;
        
        for (const cell of this.cells) {
            // Calculate leadership potential
            const leadershipPotential = cell.socialTraits.leadershipDrive * 
                                      (1 + cell.energy / 100) * 
                                      (1 + cell.lifespan / cell.maxLifespan);
            
            if (leadershipPotential > highestLeadership) {
                highestLeadership = leadershipPotential;
                bestCandidate = cell;
            }
        }
        
        this.leader = bestCandidate;
        bestCandidate.isLeader = true;
        return bestCandidate;
    }
    
    // Add a cell to the group
    addCell(cell) {
        if (!this.cells.includes(cell)) {
            this.cells.push(cell);
            cell.group = this;
            
            // If no type is set, use the first cell's type
            if (!this.type) {
                this.type = cell.type;
            }
            
            // If this cell has higher leadership than current leader, consider re-election
            if (this.leader && 
                cell.socialTraits.leadershipDrive > this.leader.socialTraits.leadershipDrive * 1.3) {
                this.electLeader();
            }
        }
    }
    
    // Remove a cell from the group
    removeCell(cell) {
        const index = this.cells.indexOf(cell);
        if (index > -1) {
            this.cells.splice(index, 1);
            cell.group = null;
            
            // If the leader was removed, elect a new one
            if (cell === this.leader) {
                cell.isLeader = false;
                this.electLeader();
            }
        }
        
        // If group is empty or too small, disband
        if (this.cells.length < 2) {
            this.disband();
        }
    }
    
    // Disband the group
    disband() {
        for (const cell of this.cells) {
            cell.group = null;
            if (cell === this.leader) {
                cell.isLeader = false;
            }
        }
        
        // Remove from global groups array
        const index = cellGroups.indexOf(this);
        if (index > -1) {
            cellGroups.splice(index, 1);
        }
    }
    
    // Update group dynamics
    update() {
        if (this.cells.length === 0) {
            return false; // Group should be removed
        }
        
        // Calculate group cohesion
        this.calculateCohesion();
        
        // Group goal-oriented behavior based on element type
        this.updateGroupGoal();
        
        // Group may split if cohesion is low
        if (this.stability < 0.2 && Math.random() < 0.1) {
            this.splitGroup();
            return false;
        }
        
        // Group behavior affects members
        this.influenceMembers();
        
        return true;
    }
    
    // Calculate how cohesive the group is
    calculateCohesion() {
        if (this.cells.length <= 1) {
            this.stability = 0;
            return;
        }
        
        // Base factors affecting cohesion
        let cohesion = 0.5;
        
        // Type homogeneity increases cohesion
        const typeCounts = {};
        for (const cell of this.cells) {
            typeCounts[cell.type] = (typeCounts[cell.type] || 0) + 1;
        }
        
        // Calculate homogeneity as percentage of dominant type
        const dominantType = Object.keys(typeCounts).reduce((a, b) => 
            typeCounts[a] > typeCounts[b] ? a : b);
        const homogeneity = typeCounts[dominantType] / this.cells.length;
        
        // Adjust cohesion based on homogeneity
        cohesion += homogeneity * 0.3;
        
        // Group size relative to preferred size affects cohesion
        const sizePreference = this.type ? SOCIAL_TRAITS[this.type].preferredGroupSize : 5;
        const sizeRatio = Math.min(this.cells.length / sizePreference, 2);
        
        if (sizeRatio < 0.5 || sizeRatio > 1.5) {
            // Either too small or too large
            cohesion -= 0.2;
        } else if (sizeRatio >= 0.8 && sizeRatio <= 1.2) {
            // Near optimal size
            cohesion += 0.2;
        }
        
        // Leadership quality affects cohesion
        if (this.leader) {
            cohesion += this.leader.socialTraits.leadershipDrive * 0.2;
            
            // Leader's energy affects cohesion
            cohesion += (this.leader.energy / 100) * 0.1;
        } else {
            cohesion -= 0.2; // No leader decreases cohesion
        }
        
        // Seasonal effects
        if (this.type === currentSeason) {
            cohesion += 0.2; // In favorable season, groups are more stable
        } else if (getOverridingElement(currentSeason) === this.type) {
            cohesion -= 0.2; // In unfavorable season, groups are less stable
        }
        
        // Apply changes gradually to avoid wild fluctuations
        this.stability = this.stability * 0.7 + Math.max(0, Math.min(1, cohesion)) * 0.3;
    }
    
    // Update group goal progress based on element type
    updateGroupGoal() {
        // Each element type has different group goals
        switch (this.type) {
            case 'wood':
                // Wood groups focus on expansion and growth
                this.goalProgress += 0.01 * this.cells.length * this.stability;
                
                if (this.goalProgress >= 10 && Math.random() < 0.1) {
                    // Wood groups that achieve goals try to spread new cells
                    this.createNewMembers();
                    this.goalProgress = 0;
                }
                break;
                
            case 'fire':
                // Fire groups focus on energy and communication
                this.goalProgress += 0.02 * this.cells.length * this.stability;
                
                if (this.goalProgress >= 10 && Math.random() < 0.1) {
                    // Fire groups that achieve goals energize members
                    for (const cell of this.cells) {
                        cell.energy += 10;
                    }
                    this.goalProgress = 0;
                }
                break;
                
            case 'earth':
                // Earth groups focus on stability and nurturing
                this.goalProgress += 0.005 * this.cells.length * this.stability;
                
                if (this.goalProgress >= 10 && Math.random() < 0.1) {
                    // Earth groups that achieve goals heal members
                    for (const cell of this.cells) {
                        cell.lifespan += 5;
                        if (cell.infected > 0) {
                            cell.infected = Math.max(0, cell.infected - 5);
                        }
                    }
                    this.goalProgress = 0;
                }
                break;
                
            case 'metal':
                // Metal groups focus on structure and defense
                this.goalProgress += 0.008 * this.cells.length * this.stability;
                
                if (this.goalProgress >= 10 && Math.random() < 0.1) {
                    // Metal groups that achieve goals improve immunity
                    for (const cell of this.cells) {
                        if (!cell.immunity) {
                            cell.immunity = true;
                            cell.immunityTimer = 100;
                        } else {
                            cell.immunityTimer += 50;
                        }
                    }
                    this.goalProgress = 0;
                }
                break;
                
            case 'water':
                // Water groups focus on flow and adaptation
                this.goalProgress += 0.015 * this.cells.length * this.stability;
                
                if (this.goalProgress >= 10 && Math.random() < 0.1) {
                    // Water groups that achieve goals improve adaptation
                    for (const cell of this.cells) {
                        // Increase resistance to environment
                        cell.energy += 5;
                        // Improve chance of mutation in reproduction
                        cell.mutationFactor = (cell.mutationFactor || 1) * 1.5;
                    }
                    this.goalProgress = 0;
                }
                break;
        }
    }
    
    // Group members influence each other
    influenceMembers() {
        for (const cell of this.cells) {
            // Leader influences members
            if (this.leader && cell !== this.leader) {
                // Leaders inspire members
                if (Math.random() < this.leader.socialTraits.leadershipDrive * 0.2) {
                    cell.energy += 0.5;
                }
                
                // Leaders may influence member behavior
                if (Math.random() < 0.1) {
                    // Slightly pull member traits toward the leader
                    for (const trait in cell.socialTraits) {
                        if (this.leader.socialTraits[trait] !== undefined) {
                            cell.socialTraits[trait] = cell.socialTraits[trait] * 0.95 + 
                                                     this.leader.socialTraits[trait] * 0.05;
                        }
                    }
                }
            }
            
            // Group members share energy in emergencies
            const emergencyCells = this.cells.filter(c => c.energy < 20);
            if (emergencyCells.length > 0 && cell.energy > 50) {
                // Cells help others based on their nurturing trait
                const donationAmount = 0.5 * (cell.socialTraits.nurturing || 0.3);
                cell.energy -= donationAmount * emergencyCells.length;
                
                for (const emergencyCell of emergencyCells) {
                    emergencyCell.energy += donationAmount;
                }
            }
        }
    }
    
    // Split the group if cohesion is low
    splitGroup() {
        if (this.cells.length < 4) return; // Too small to split
        
        // Get random seed members
        const seedA = this.cells[Math.floor(Math.random() * this.cells.length)];
        let seedB;
        do {
            seedB = this.cells[Math.floor(Math.random() * this.cells.length)];
        } while (seedB === seedA);
        
        // Create two new groups
        const groupA = new CellGroup([seedA]);
        const groupB = new CellGroup([seedB]);
        
        // Distribute remaining members
        for (const cell of this.cells) {
            if (cell !== seedA && cell !== seedB) {
                // Calculate distance from seeds (can be physical or trait-based)
                const distanceToA = Math.abs(cell.x - seedA.x) + Math.abs(cell.y - seedA.y);
                const distanceToB = Math.abs(cell.x - seedB.x) + Math.abs(cell.y - seedB.y);
                
                if (distanceToA < distanceToB) {
                    groupA.addCell(cell);
                } else {
                    groupB.addCell(cell);
                }
            }
        }
        
        // Disband this group
        this.disband();
        
        // Add new groups to global list
        cellGroups.push(groupA);
        cellGroups.push(groupB);
    }
    
    // Create new cells from group effort
    createNewMembers() {
        // Use group resources to create new cells
        const maxNewCells = Math.floor(this.cells.length / 3);
        const actualNewCells = Math.max(1, Math.floor(maxNewCells * this.stability));
        
        for (let i = 0; i < actualNewCells; i++) {
            // Find a random group member to be the parent
            const parent = this.cells[Math.floor(Math.random() * this.cells.length)];
            
            // Find empty neighboring cells
            const emptySpaces = getNeighboringEmptyCells(parent.x, parent.y);
            
            if (emptySpaces.length > 0) {
                // Create a new cell
                const [nx, ny] = emptySpaces[Math.floor(Math.random() * emptySpaces.length)];
                
                // New cell will be same type as parent but resources come from group
                const newCell = new Cell(nx, ny, parent.type);
                
                // Each group member contributes a small amount of energy
                for (const member of this.cells) {
                    member.energy -= 5 / this.cells.length;
                }
                
                // The new cell inherits social traits from the parent with slight mutations
                newCell.socialTraits = { ...parent.socialTraits };
                for (const trait in newCell.socialTraits) {
                    // Small random variation in traits
                    newCell.socialTraits[trait] += (Math.random() - 0.5) * 0.2;
                    newCell.socialTraits[trait] = Math.max(0, Math.min(1, newCell.socialTraits[trait]));
                }
                
                // Add to global lists
                grid[ny][nx] = newCell;
                entities.push(newCell);
                cells.push(newCell);
                
                // Add to this group
                this.addCell(newCell);
            }
        }
    }
    
    // Draw group visualization (call during render)
    draw() {
        // Don't draw anything for very small groups
        if (this.cells.length < 3) return;
        
        // Find group center
        let centerX = 0, centerY = 0;
        for (const cell of this.cells) {
            centerX += cell.x;
            centerY += cell.y;
        }
        centerX /= this.cells.length;
        centerY /= this.cells.length;
        
        // Draw group aura with alpha based on cohesion
        const drawX = centerX * CELL_SIZE;
        const drawY = centerY * CELL_SIZE;
        
        // Calculate radius to encompass the group
        let maxDistance = 0;
        for (const cell of this.cells) {
            const distance = Math.sqrt(
                Math.pow((cell.x - centerX) * CELL_SIZE, 2) + 
                Math.pow((cell.y - centerY) * CELL_SIZE, 2)
            );
            maxDistance = Math.max(maxDistance, distance);
        }
        
        // Add a buffer to the radius
        const radius = maxDistance + CELL_SIZE * 2;
        
        // Draw group aura with type-specific color
        ctx.globalAlpha = this.stability * 0.15;
        ctx.fillStyle = CELL_COLORS[this.type];
        ctx.beginPath();
        ctx.arc(drawX, drawY, radius, 0, Math.PI * 2);
        ctx.fill();
        
        // Draw connection lines between group members
        ctx.globalAlpha = this.stability * 0.3;
        ctx.strokeStyle = CELL_COLORS[this.type];
        ctx.lineWidth = 1;
        
        // Connect all cells to the leader if present
        if (this.leader) {
            const leaderX = this.leader.x * CELL_SIZE + CELL_SIZE/2;
            const leaderY = this.leader.y * CELL_SIZE + CELL_SIZE/2;
            
            for (const cell of this.cells) {
                if (cell !== this.leader) {
                    const cellX = cell.x * CELL_SIZE + CELL_SIZE/2;
                    const cellY = cell.y * CELL_SIZE + CELL_SIZE/2;
                    
                    ctx.beginPath();
                    ctx.moveTo(leaderX, leaderY);
                    ctx.lineTo(cellX, cellY);
                    ctx.stroke();
                }
            }
            
            // Highlight the leader with a small corona
            ctx.globalAlpha = 0.6;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(leaderX, leaderY, CELL_SIZE * 0.8, 0, Math.PI * 2);
            ctx.stroke();
        }
        
        ctx.globalAlpha = 1.0; // Reset alpha
    }
}

// Add this to your global variables
let cellGroups = [];

// Modify the Cell constructor to include social traits
class Cell extends Entity {
    constructor(x, y, type) {
        super(x, y, type);
        this.color = CELL_COLORS[type];
        this.shape = CELL_SHAPES[type];
        this.size = CELL_SIZES[type];
        this.energy = 100;
        
        // Add social traits based on type
        this.socialTraits = { ...SOCIAL_TRAITS[type] };
        
        // Add small random variations to make each cell unique
        for (const trait in this.socialTraits) {
            this.socialTraits[trait] += (Math.random() - 0.5) * 0.2;
            this.socialTraits[trait] = Math.max(0, Math.min(1, this.socialTraits[trait]));
        }
        
        // Group membership
        this.group = null;
        this.isLeader = false;
        this.groupingTimer = 0; // Counter for group joining attempts
        
        // Social memory - remembers interactions
        this.socialMemory = [];
        
        // Rest of the existing properties...
        let lifespanModifier = 1.0;
        if (type === currentSeason) {
            lifespanModifier = 1.5;
        } else if (getGeneratedElement(currentSeason) === type) {
            lifespanModifier = 1.3;
        } else if (getOverridingElement(currentSeason) === type) {
            lifespanModifier = 0.7;
        }
        
        this.maxLifespan = Math.floor(Math.random() * (300 - 100 + 1) + 100) * lifespanModifier;
        this.pulsePhase = Math.random() * Math.PI * 2;
        
        this.infected = 0;
        this.infectedBy = null;
        this.immunity = false;
        this.immunityTimer = 0;
        
        this.activity = getActivityByType(type);        
        this.energyToReproduce = getEnergyToReproduceByType(type);    
        this.reproductionRate = getReproductionRateByType(type);  
        
        if (type === currentSeason) {
            this.reproductionRate *= 1.5;
        } else if (getGeneratedElement(currentSeason) === type) {
            this.reproductionRate *= 1.3;
        } else if (getOverridingElement(currentSeason) === type) {
            this.reproductionRate *= 0.7;
        }
        
        this.lifespan = this.maxLifespan;
    }
    
    // Add social behavior methods
    
    // Try to join a group or form a new one
    considerGrouping() {
        // Decrement grouping timer if set
        if (this.groupingTimer > 0) {
            this.groupingTimer--;
            return;
        }
        
        // Skip if already in a group
        if (this.group) return;
        
        // Probability of trying to join a group depends on groupOrientation trait
        if (Math.random() > this.socialTraits.groupOrientation) {
            // Not interested in grouping right now
            this.groupingTimer = 20; // Wait 20 turns before trying again
            return;
        }
        
        // Look for nearby cells
        const neighborCells = getNeighboringCells(this.x, this.y).filter(e => e instanceof Cell);
        
        if (neighborCells.length === 0) return; // No neighbors
        
        // Check if any neighbors are in groups
        const neighborGroups = neighborCells
            .filter(cell => cell.group)
            .map(cell => cell.group)
            .filter((group, index, self) => 
                self.indexOf(group) === index); // Unique groups
        
        if (neighborGroups.length > 0) {
            // Try to join an existing group
            let bestGroup = null;
            let bestScore = -1;
            
            for (const group of neighborGroups) {
                // Calculate compatibility score
                let score = 0;
                
                // Prefer groups of the same type
                if (group.type === this.type) {
                    score += 2;
                } else if (getFiveElementsRelation(this.type, group.type) === 'generates') {
                    score += 1; // Some affinity for groups we generate
                }
                
                // Prefer groups near optimal size
                const sizePreference = this.socialTraits.preferredGroupSize;
                const sizeDifference = Math.abs(group.cells.length - sizePreference);
                score -= sizeDifference * 0.2;
                
                // Prefer stable groups
                score += group.stability * 2;
                
                // Check for leadership compatibility
                if (group.leader) {
                    if (this.socialTraits.leadershipDrive > group.leader.socialTraits.leadershipDrive + 0.3) {
                        // Cell wants to lead but group already has strong leader - conflict
                        score -= 2;
                    } else {
                        // Cell is okay with current leadership
                        score += 1;
                    }
                } else if (this.socialTraits.leadershipDrive > 0.6) {
                    // Group needs leader and cell can lead
                    score += 2;
                }
                
                if (score > bestScore) {
                    bestScore = score;
                    bestGroup = group;
                }
            }
            
            if (bestScore > 0 && bestGroup) {
                // Join the best group
                bestGroup.addCell(this);
                return;
            }
        }
        
        // If didn't join a group, maybe start a new one with a neighbor
        if (Math.random() < this.socialTraits.leadershipDrive * 0.5) {
            // Find compatible neighbors
            const compatibleNeighbors = neighborCells.filter(cell => 
                !cell.group && 
                (cell.type === this.type || 
                 getFiveElementsRelation(this.type, cell.type) === 'generates'));
            
            if (compatibleNeighbors.length > 0) {
                // Start a new group
                const newGroup = new CellGroup([this]);
                cellGroups.push(newGroup);
                
                // Try to add a few compatible neighbors
                for (let i = 0; i < Math.min(3, compatibleNeighbors.length); i++) {
                    newGroup.addCell(compatibleNeighbors[i]);
                }
            }
        }
    }
    
    // Record social interaction with another cell
    recordInteraction(otherCell, interactionType) {
        // Keep memory limited to recent interactions
        if (this.socialMemory.length > 10) {
            this.socialMemory.shift();
        }
        
        this.socialMemory.push({
            cellType: otherCell.type,
            interactionType: interactionType,
            turn: turn,
            outcome: interactionType === 'positive' ? 1 : -1
        });
    }
    
    // Check attitude toward another cell based on memory
    getAttitudeToward(otherCell) {
        // Default neutral attitude
        let attitude = 0;
        
        // Base attitude on element relations
        const relation = getFiveElementsRelation(this.type, otherCell.type);
        if (relation === 'generates') {
            attitude += 1; // Positive toward elements we generate
        } else if (relation === 'overrides') {
            attitude += 0.5; // Slightly positive toward elements we override
        } else if (getOverridingElement(this.type) === otherCell.type) {
            attitude -= 0.5; // Slightly negative toward elements that override us
        }
        
        // Check memory for past interactions
        const relevantMemories = this.socialMemory.filter(memory => 
            memory.cellType === otherCell.type);
        
        let memoryEffect = 0;
        for (const memory of relevantMemories) {
            // More recent memories have stronger effect
            const recency = (turn - memory.turn) / 100;
            const effect = memory.outcome * Math.max(0, 1 - recency);
            memoryEffect += effect;
        }
        
        attitude += memoryEffect;
        
        return Math.max(-1, Math.min(1, attitude));
    }
    
    // Enhanced move method to incorporate social behavior
    move() {
        // Add social behavior processing
        this.considerGrouping();
        
        // Handle group leaving
        if (this.group && Math.random() > this.socialTraits.groupOrientation * 0.95) {
            // Occasionally check if the cell wants to stay in the group
            let stayChance = this.group.stability;
            
            // Modify based on type - some types are more loyal
            if (this.type === 'earth') {
                stayChance += 0.3;
            } else if (this.type === 'water') {
                stayChance -= 0.2;
            }
            
            if (Math.random() > stayChance) {
                this.group.removeCell(this);
            }
        }
        
        // Rest of the original move logic with social modifications...
        
        // For example, modify movement based on social traits
        let moveChance = this.activity;
        
        // Introverts move less in groups, extroverts move more
        if (this.group) {
            if (this.socialTraits.extroversion > 0.5) {
                moveChance *= 1.2; // Extroverts are more active in groups
            } else {
                moveChance *= 0.8; // Introverts are less active in groups
            }
        }
        
        // Leaders are more active
        if (this.isLeader) {
            moveChance *= 1.3;
        }
        
        // Rest of your existing move method...
        
        return true; // Cell remains alive
    }
    
    // Modification to the draw method to show social status
    draw() {
        // Original drawing code...
        
        // Add visual indicators for group membership and leadership
        if (this.isLeader) {
            // Draw a crown or indicator for leaders
            const drawX = this.x * CELL_SIZE;
            const drawY = this.y * CELL_SIZE;
            
            ctx.strokeStyle = '#FFD700'; // Gold color for leaders
            ctx.lineWidth = 2;
            ctx.beginPath();
            
            // Simple crown shape
            const crownSize = CELL_SIZE * 0.6;
            ctx.moveTo(drawX + CELL_SIZE/2 - crownSize/2, drawY - 2);
            ctx.lineTo(drawX + CELL_SIZE/2 - crownSize/3, drawY - crownSize/2);
            ctx.lineTo(drawX + CELL_SIZE/2, drawY - 2);
            ctx.lineTo(drawX + CELL_SIZE/2 + crownSize/3, drawY - crownSize/2);
            ctx.lineTo(drawX + CELL_SIZE/2 + crownSize/2, drawY - 2);
            
            ctx.stroke();
        }
    }
}

// Modify the update function to also update groups
function update() {
    // Update existing code...
    
    // Add group updates
    for (let i = cellGroups.length - 1; i >= 0; i--) {
        const isActive = cellGroups[i].update();
        if (!isActive) {
            cellGroups.splice(i, 1);
        }
	}
	
	// 追加の関数と変更点 - Five Elements Life Game

// グローバル変数に追加
let cellGroups = []; // 細胞グループの配列
let socialInteractions = []; // 社会的相互作用の視覚効果用配列

// グループごとの集団的目標タイプ
const GROUP_GOALS = {
    wood: {
        name: '拡張・創造',
        color: '#8BC34A', // 明るい緑
        icon: 'expand'
    },
    fire: {
        name: '熱意・表現',
        color: '#FF9800', // オレンジ
        icon: 'flame'
    },
    earth: {
        name: '安定・調和',
        color: '#FFEB3B', // 黄色
        icon: 'balance'
    },
    metal: {
        name: '規律・秩序',
        color: '#9E9E9E', // シルバー
        icon: 'shield'
    },
    water: {
        name: '柔軟・適応',
        color: '#03A9F4', // 水色
        icon: 'flow'
    }
};

// 社会的相互作用の視覚効果クラス
class SocialEffect {
    constructor(x1, y1, x2, y2, type, intensity) {
        this.x1 = x1;
        this.y1 = y1;
        this.x2 = x2;
        this.y2 = y2;
        this.type = type; // 'positive', 'negative', 'neutral'
        this.intensity = intensity; // 0-1
        this.lifespan = 15; // 表示フレーム数
        this.alpha = 0.7;
    }
    
    update() {
        this.lifespan--;
        this.alpha *= 0.9;
        return this.lifespan > 0;
    }
    
    draw() {
        const startX = this.x1 * CELL_SIZE + CELL_SIZE/2;
        const startY = this.y1 * CELL_SIZE + CELL_SIZE/2;
        const endX = this.x2 * CELL_SIZE + CELL_SIZE/2;
        const endY = this.y2 * CELL_SIZE + CELL_SIZE/2;
        
        // 相互作用タイプによる色の設定
        let color;
        if (this.type === 'positive') {
            color = 'rgba(50, 205, 50, ' + this.alpha + ')'; // 緑
        } else if (this.type === 'negative') {
            color = 'rgba(220, 20, 60, ' + this.alpha + ')'; // 赤
        } else {
            color = 'rgba(200, 200, 200, ' + this.alpha + ')'; // グレー
        }
        
        // 線の描画
        ctx.strokeStyle = color;
        ctx.lineWidth = this.intensity * 3;
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.stroke();
        
        // 効果タイプに応じたエフェクト
        if (this.type === 'positive') {
            // プラスの相互作用は小さな星や光の粒を描く
            const particleCount = Math.floor(this.intensity * 5);
            for (let i = 0; i < particleCount; i++) {
                const ratio = Math.random();
                const particleX = startX + (endX - startX) * ratio;
                const particleY = startY + (endY - startY) * ratio;
                
                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.arc(particleX, particleY, 2 * this.intensity, 0, Math.PI * 2);
                ctx.fill();
            }
        } else if (this.type === 'negative') {
            // 負の相互作用は小さな衝突や波線
            const particleCount = Math.floor(this.intensity * 3);
            for (let i = 0; i < particleCount; i++) {
                const ratio = Math.random();
                const particleX = startX + (endX - startX) * ratio;
                const particleY = startY + (endY - startY) * ratio;
                
                ctx.fillStyle = color;
                ctx.beginPath();
                const size = 3 * this.intensity;
                ctx.moveTo(particleX - size, particleY - size);
                ctx.lineTo(particleX + size, particleY + size);
                ctx.moveTo(particleX + size, particleY - size);
                ctx.lineTo(particleX - size, particleY + size);
                ctx.stroke();
            }
        }
    }
}

// Cell クラスの move メソッドを拡張
// 既存のCellクラスのmoveメソッドを以下のものに置き換え
Cell.prototype.move = function() {
    // 感染の影響を処理（既存のコード）
    if (this.infected > 0) {
        // ここに既存の感染処理コード（省略）...
    }
    
    // 社会的行動処理を追加
    this.considerGrouping();
    
    // グループに所属している場合、グループからの離脱を検討
    if (this.group && Math.random() > this.socialTraits.groupOrientation * this.group.stability) {
        // グループへの忠誠度は型によって異なる
        let loyaltyModifier = 1.0;
        
        switch (this.type) {
            case 'earth':
                loyaltyModifier = 1.5; // 土はグループに忠実
                break;
            case 'water':
                loyaltyModifier = 0.7; // 水は離脱しやすい
                break;
            case 'metal':
                // 金属は構造的安定性に基づいて判断
                loyaltyModifier = this.group.stability > 0.6 ? 1.3 : 0.8;
                break;
            case 'wood':
                // 木は目標達成に基づいて判断
                loyaltyModifier = this.group.goalProgress > 5 ? 1.3 : 0.9;
                break;
            case 'fire':
                // 火は感情的つながりに基づいて判断
                const emotionalBond = this.isLeader ? 1.5 : 0.9;
                loyaltyModifier = emotionalBond;
                break;
        }
        
        if (Math.random() > this.group.stability * loyaltyModifier) {
            this.group.removeCell(this);
        }
    }
    
    // 活動性に基づく移動
    let moveChance = this.activity;
    
    // 社会的特性による移動修正
    if (this.group) {
        // 内向/外向によって集団内での活動が変化
        if (this.socialTraits.extroversion > 0.5) {
            moveChance *= 1.1; // 外向的な細胞は集団内でも活発
        } else {
            moveChance *= 0.9; // 内向的な細胞は集団内では活動が抑制
        }
        
        // リーダーはより活発
        if (this.isLeader) {
            moveChance *= 1.2;
        }
        
        // 集団サイズに対する好みによる影響
        const sizePreference = this.socialTraits.preferredGroupSize || 5;
        const sizeDifference = Math.abs(this.group.cells.length - sizePreference);
        
        if (sizeDifference > 3) {
            // サイズが大きく異なるとストレス
            moveChance *= 1.1; // より動き回る
        }
    } else {
        // 集団に所属していない場合
        if (this.socialTraits.groupOrientation > 0.7) {
            // 集団志向が高い場合、所属先を探すため活発に動く
            moveChance *= 1.2;
        }
    }
    
    // 季節による動きの調整（既存のコード）
    let moveRange = 1;
    if (this.type === currentSeason) {
        moveRange = Math.random() < 0.3 ? 2 : 1;
    } else if (getOverridingElement(currentSeason) === this.type) {
        moveRange = Math.random() < 0.7 ? 1 : 0;
    }
    
    // 実際の移動ロジック
    if (Math.random() < moveChance) {
        // グループの影響を受けた移動（もしリーダーがいればリーダー方向へ引力）
        let dx, dy;
        
        if (this.group && this.group.leader && this.group.leader !== this && Math.random() < 0.4) {
            // リーダーへの引力
            dx = Math.sign(this.group.leader.x - this.x);
            dy = Math.sign(this.group.leader.y - this.y);
            
            // ランダムな要素も追加
            dx += Math.floor(Math.random() * 3) - 1;
            dy += Math.floor(Math.random() * 3) - 1;
            
            // 範囲内に収める
            dx = Math.max(-moveRange, Math.min(moveRange, dx));
            dy = Math.max(-moveRange, Math.min(moveRange, dy));
        } else {
            // 通常のランダム移動
            dx = Math.floor(Math.random() * (moveRange * 2 + 1)) - moveRange;
            dy = Math.floor(Math.random() * (moveRange * 2 + 1)) - moveRange;
        }
        
        const newX = Math.max(0, Math.min(GRID_SIZE_X - 1, this.x + dx));
        const newY = Math.max(0, Math.min(GRID_SIZE_Y - 1, this.y + dy));

        // 近接セルとの相互作用（既存コードから拡張）
        const neighborCells = getNeighboringCells(this.x, this.y);
        for (const cell of neighborCells) {
            if (cell instanceof Cell) {
                // 五行相生相剋の関係
                const relation = getFiveElementsRelation(this.type, cell.type);
                
                // 既存の相互作用処理...
                
                // 社会的相互作用の追加
                const attitude = this.getAttitudeToward(cell);
                let interactionType = 'neutral';
                let interactionStrength = 0.5;
                
                if (relation === 'generates' || attitude > 0.3) {
                    // 生成関係または良好な態度
                    interactionType = 'positive';
                    interactionStrength = 0.7 + attitude * 0.3;
                    
                    // 正の相互作用
                    this.energy += 0.2;
                    cell.energy += 0.1;
                    
                    // 社会的記憶に記録
                    this.recordInteraction(cell, 'positive');
                    
                    // 両方が同じグループでない場合、グループ招待を検討
                    if (this.group && !cell.group && Math.random() < 0.1) {
                        this.group.addCell(cell);
                    }
                    
                } else if (relation === 'overrides' || attitude < -0.3) {
                    // 抑制関係または否定的な態度
                    interactionType = 'negative';
                    interactionStrength = 0.7 - attitude * 0.3;
                    
                    // 負の相互作用
                    cell.energy -= 0.1;
                    
                    // 社会的記憶に記録
                    this.recordInteraction(cell, 'negative');
                    
                    // 同じグループの場合、グループ分裂のリスク
                    if (this.group && cell.group === this.group && Math.random() < 0.05) {
                        this.group.stability -= 0.1;
                    }
                }
                
                // 相互作用の視覚効果
                if (Math.random() < interactionStrength * 0.3) {
                    const effect = new SocialEffect(
                        this.x, this.y, cell.x, cell.y, 
                        interactionType, interactionStrength
                    );
                    socialInteractions.push(effect);
                }
            }
        }

        // 移動先チェック
        if (grid[newY][newX] === null) {
            grid[this.y][this.x] = null;
            this.x = newX;
            this.y = newY;
            grid[this.y][this.x] = this;
        } else if (grid[newY][newX] instanceof Corpse) {
            // 死骸の処理（既存のコード）...
        }
    }
    
    // タイプ別の特殊能力の適用（既存のコード）
    applyElementSpecialAbility(this);
    
    // エネルギーと寿命の減少（既存のコード）...
    
    // 社会的役割によるエネルギー消費調整
    if (this.isLeader) {
        // リーダーはエネルギーを多く消費する
        this.energy -= 0.05;
    } else if (this.group) {
        // グループメンバーのエネルギー調整
        if (this.type === 'earth') {
            // 土はグループ内でエネルギー回復が早い
            this.energy += 0.03;
        } else if (this.type === 'fire' && this.socialTraits.extroversion > 0.7) {
            // 外向的な火はグループでより活性化
            this.energy += 0.02;
        }
    }
    
    // 繁殖ロジック（既存のコードから拡張）
    let reproductionThreshold = this.energyToReproduce;
    let reproductionProbability = this.reproductionRate;
    
    // 社会的特性による繁殖率調整
    if (this.group) {
        // グループ内での繁殖は型によって異なる
        switch (this.type) {
            case 'wood':
                // 木はグループ内でより繁殖に積極的
                reproductionProbability *= 1.2;
                break;
            case 'fire':
                // 火は活発なグループでより繁殖力が高まる
                reproductionProbability *= this.group.cells.length > 3 ? 1.2 : 0.9;
                break;
            case 'earth':
                // 土は安定したグループで繁殖力が高まる
                reproductionProbability *= this.group.stability > 0.7 ? 1.3 : 1.0;
                break;
            case 'metal':
                // 金属は適切なサイズのグループで繁殖力が高まる
                const optimalSize = this.socialTraits.preferredGroupSize || 4;
                const sizeDiff = Math.abs(this.group.cells.length - optimalSize);
                reproductionProbability *= sizeDiff < 2 ? 1.2 : 0.9;
                break;
            case 'water':
                // 水はグループサイズに依らず一定の繁殖率
                reproductionProbability *= 1.0;
                break;
        }
    }
    
    // 混雑係数とその他の繁殖ロジック（既存のコード）...
    
    // 死亡判定（既存のコード）...
    
    return true; // 細胞は生存継続
};

// Cell.prototype.reproduce の拡張（既存のメソッドを置き換え）
Cell.prototype.reproduce = function() {
    const neighbors = getNeighboringEmptyCells(this.x, this.y);
    
    // 空きセルの数に基づいて繁殖確率を調整（密度依存）
    const emptyNeighborRatio = neighbors.length / 8;
    
    if (neighbors.length > 0 && Math.random() < emptyNeighborRatio * 0.8 + 0.2) {
        const [nx, ny] = neighbors[Math.floor(Math.random() * neighbors.length)];

        // 突然変異のチャンス（季節によって調整）
        let mutationChance = 0.1;
        
        // 型による突然変異率調整
        if (this.type === 'wood') {
            mutationChance *= 1.5; // 木は変化しやすい
        } else if (this.type === 'metal') {
            mutationChance *= 0.7; // 金属は安定
        } else if (this.type === 'water') {
            // 水は適応性が高く、季節に応じて突然変異率が変化
            mutationChance *= currentSeason === 'water' ? 1.0 : 1.2;
        }
        
        // 社会的影響
        if (this.group) {
            // グループ内での繁殖は安定する傾向
            mutationChance *= 0.8;
            
            // ただし水は例外的に常に変化を好む
            if (this.type === 'water') {
                mutationChance *= 1.2;
            }
        }
        
        const childType = Math.random() < (1 - mutationChance) ? this.type : CELL_TYPES[Math.floor(Math.random() * CELL_TYPES.length)];
        const newCell = new Cell(nx, ny, childType);
        
        // 世代の記録
        if (this.generation !== undefined) {
            newCell.generation = this.generation + 1;
        } else {
            newCell.generation = 1;
        }
        
        // 社会的特性の継承（わずかな変異を加えて）
        newCell.socialTraits = { ...this.socialTraits };
        for (const trait in newCell.socialTraits) {
            // 特性に小さな変異を追加
            let variation = (Math.random() - 0.5) * 0.2;
            
            // 型ごとの特性強化
            if (trait === 'groupOrientation' && childType === 'earth') {
                variation = Math.max(0, variation); // 土は集団志向が強まる方向へ
            } else if (trait === 'leadershipDrive' && childType === 'wood') {
                variation = Math.max(0, variation); // 木はリーダーシップが強まる方向へ
            } else if (trait === 'extroversion' && childType === 'fire') {
                variation = Math.max(0, variation); // 火は外向性が強まる方向へ
            }
            
            newCell.socialTraits[trait] += variation;
            newCell.socialTraits[trait] = Math.max(0, Math.min(1, newCell.socialTraits[trait]));
        }
        
        // 免疫の継承
        if (this.immunity && Math.random() < 0.3) {
            newCell.immunity = true;
            newCell.immunityTimer = 40;
        }
        
        // グリッドへの追加
        grid[ny][nx] = newCell;
        entities.push(newCell);
        cells.push(newCell);
        
        // 親のグループへの自動参加（ただし確率的）
        if (this.group && Math.random() < this.socialTraits.groupOrientation * 0.8) {
            this.group.addCell(newCell);
        }
        
        // 繁殖によるエネルギー消費
        this.energy -= 30;
    }
};

// 情報パネル更新関数を強化
function updateInfoPanel() {
    // 既存の表示内容（ウイルス数、季節表示、個体数など）

    // グループ情報の追加
    if (cellGroups.length > 0) {
        const groupSummary = document.createElement('div');
        groupSummary.style.marginTop = '10px';
        groupSummary.innerHTML = `<div><strong>社会集団:</strong> ${cellGroups.length}グループ</div>`;
        
        // 型ごとのグループ数
        const groupsByType = {};
        for (const type of CELL_TYPES) {
            groupsByType[type] = cellGroups.filter(group => group.type === type).length;
        }
        
        // グループ概要の表示
        let groupTypesHTML = '';
        for (const type of CELL_TYPES) {
            if (groupsByType[type] > 0) {
                groupTypesHTML += `<div style="display: flex; align-items: center; margin-top: 2px;">
                    <div style="width: 10px; height: 10px; background-color: ${CELL_COLORS[type]}; margin-right: 5px;"></div>
                    <span>${type}集団: ${groupsByType[type]} (${GROUP_GOALS[type].name})</span>
                </div>`;
            }
        }
        
        // 大きなグループの表示
        const largeGroups = cellGroups.filter(group => group.cells.length >= 5);
        largeGroups.sort((a, b) => b.cells.length - a.cells.length);
        
        if (largeGroups.length > 0) {
            groupTypesHTML += `<div style="margin-top: 5px;"><strong>主要集団:</strong></div>`;
            
            for (let i = 0; i < Math.min(3, largeGroups.length); i++) {
                const group = largeGroups[i];
                const stabilityDisplay = Math.round(group.stability * 100);
                groupTypesHTML += `<div style="margin-top: 2px;">
                    <span style="color:${CELL_COLORS[group.type]};">&#9679;</span> 
                    ${group.type}集団 (${group.cells.length}細胞, 安定性:${stabilityDisplay}%)
                </div>`;
            }
        }
        
        groupSummary.innerHTML += groupTypesHTML;
        populationBarsDisplay.appendChild(groupSummary);
    }

    // 既存のコード（ターンカウンター更新など）...
}

// draw関数の強化
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // 背景描画（既存コード）
    const speed = parseInt(speedSlider.value);
    if (speed < 100) {
        drawBackground();
    }
    
    // グループの描画（エンティティの下に描画）
    for (const group of cellGroups) {
        group.draw();
    }
    
    // エンティティの描画（既存コード）
    for (let entity of entities) {
        entity.draw();
    }
    
    // 社会的相互作用の視覚効果
    for (const interaction of socialInteractions) {
        interaction.draw();
    }
}

// update関数の強化
function update() {
    // 季節の更新（既存コード）...
    
    // 災害状態の更新（既存コード）...
    
    // 環境収容能力に基づくストレス計算（既存コード）...
    
    // エンティティの更新（既存コード）...
    
    // グループの更新
    for (let i = cellGroups.length - 1; i >= 0; i--) {
        const isActive = cellGroups[i].update();
        if (!isActive || cellGroups[i].cells.length === 0) {
            cellGroups.splice(i, 1);
        }
    }
    
    // 社会的相互作用の視覚効果の更新
    for (let i = socialInteractions.length - 1; i >= 0; i--) {
        const isActive = socialInteractions[i].update();
        if (!isActive) {
            socialInteractions.splice(i, 1);
        }
    }
    
    // 時々新しいグループの形成を促進
    if (Math.random() < 0.01 && cells.length > 10) {
        tryFormNewGroup();
    }
    
    // 既存コードの続き（新しいウイルス生成など）...
    
    turn++;
    
    // 情報パネルの更新（既存コード）...
}

// 新しいグループ形成を試みる関数
function tryFormNewGroup() {
    // 所属していない細胞のうち、集団志向が高いものを探す
    const unaffiliatedCells = cells.filter(cell => !cell.group && cell.socialTraits.groupOrientation > 0.6);
    
    if (unaffiliatedCells.length < 3) return; // 十分な細胞がいない
    
    // 潜在的なリーダーを探す
    const leaderCandidates = unaffiliatedCells.filter(cell => cell.socialTraits.leadershipDrive > 0.6);
    
    if (leaderCandidates.length === 0) return; // リーダー候補がいない
    
    // リーダーをランダムに選ぶ
    const leader = leaderCandidates[Math.floor(Math.random() * leaderCandidates.length)];
    
    // リーダーの近くで同じ型または関連する型の細胞を探す
    const nearbyUnaffiliated = unaffiliatedCells.filter(cell => 
        cell !== leader && 
        Math.abs(cell.x - leader.x) + Math.abs(cell.y - leader.y) < 10 && // マンハッタン距離
        (cell.type === leader.type || getFiveElementsRelation(leader.type, cell.type) === 'generates')
    );
    
    if (nearbyUnaffiliated.length < 2) return; // 近くに十分な適合細胞がいない
    
    // 新しいグループを形成
    const newGroup = new CellGroup([leader]);
    cellGroups.push(newGroup);
    
    // 近くの適合細胞を追加（最大5細胞まで）
    const initialMembers = nearbyUnaffiliated.slice(0, 5);
    for (const cell of initialMembers) {
        newGroup.addCell(cell);
    }
    
    console.log(`New group formed with ${newGroup.cells.length} cells of type ${leader.type}`);
}

// 初期化関数の強化
function init() {
    // 既存の初期化コード...
    
    // 社会的相互作用配列の初期化
    socialInteractions = [];
    cellGroups = [];
    
    // 残りの初期化コード...
}

// 社会的相互作用をトリガーする関数（手動テスト用）
function triggerSocialEvent(intensity = 0.5) {
    // 現在のグループから1つ選択
    if (cellGroups.length === 0) return;
    
    const randomGroup = cellGroups[Math.floor(Math.random() * cellGroups.length)];
    
    if (randomGroup.cells.length < 3) return;
    
    // グループ内の相互作用を強化
    for (let i = 0; i < randomGroup.cells.length; i++) {
        const cell1 = randomGroup.cells[i];
        
        for (let j = i + 1; j < randomGroup.cells.length; j++) {
            const cell2 = randomGroup.cells[j];
            
            if (Math.random() < 0.3) {
                // グループ内の相互作用をビジュアル化
                const effect = new SocialEffect(
                    cell1.x, cell1.y, cell2.x, cell2.y, 
                    'positive', intensity
                );
                socialInteractions.push(effect);
                
                // 相互作用によるエネルギー交換
                cell1.energy += 1;
                cell2.energy += 1;
            }
        }
    }
    
    // グループの安定性向上
    randomGroup.stability += 0.1;
    randomGroup.stability = Math.min(1, randomGroup.stability);
    
    console.log(`Social event triggered in group of type ${randomGroup.type} with ${randomGroup.cells.length} members`);
}

// runSocialTest関数の続き
function runSocialTest() {
    // 社会的行動の単体テスト
    console.log("=== 社会的行動テスト開始 ===");
    
    // 全グループ情報
    console.log(`現在のグループ数: ${cellGroups.length}`);
    cellGroups.forEach((group, index) => {
        console.log(`グループ ${index}: 型=${group.type}, メンバー数=${group.cells.length}, 安定性=${group.stability.toFixed(2)}`);
    });
    
    // セルの社会的特性のサンプリング
    const sampleSize = Math.min(5, cells.length);
    for (let i = 0; i < sampleSize; i++) {
        const cell = cells[Math.floor(Math.random() * cells.length)];
        console.log(`サンプル細胞 ${i}: 型=${cell.type}, グループ=${cell.group ? 'あり' : 'なし'}, 活動=${cell.activity.toFixed(2)}`);
        console.log('社会的特性:', JSON.stringify(cell.socialTraits));
    }
    
    // 新しいグループ形成をテスト
    tryFormNewGroup();
    
    // 社会的イベントをトリガー
    triggerSocialEvent(0.7);
    
    console.log("=== 社会的行動テスト終了 ===");
}

// 細胞のタイプ別行動特性を考慮したの拡張関数

// タイプ別の集団行動特性を適用
function applyTypeSpecificGroupBehavior(cell) {
    if (!cell.group) return;
    
    // 型ごとの特殊な集団行動
    switch (cell.type) {
        case 'wood':
            // 木は前進的・目標志向
            applyWoodGroupBehavior(cell);
            break;
        case 'fire':
            // 火は表現的・感情的
            applyFireGroupBehavior(cell);
            break;
        case 'earth':
            // 土は調和・安定志向
            applyEarthGroupBehavior(cell);
            break;
        case 'metal':
            // 金属は秩序・規律志向
            applyMetalGroupBehavior(cell);
            break;
        case 'water':
            // 水は適応的・直感的
            applyWaterGroupBehavior(cell);
            break;
    }
}

// 木の集団行動 - 推進者・企画者・戦略担当
function applyWoodGroupBehavior(cell) {
    // リーダーシップ行動
    if (cell.isLeader) {
        // 木のリーダーはグループを拡大しようとする
        const neighborCells = getExtendedNeighborCells(cell.x, cell.y, 3);
        const unaffiliatedCells = neighborCells.filter(
            entity => entity instanceof Cell && !entity.group
        );
        
        // 確率的に新しいメンバーを勧誘
        if (unaffiliatedCells.length > 0 && Math.random() < 0.1) {
            const recruit = unaffiliatedCells[Math.floor(Math.random() * unaffiliatedCells.length)];
            
            // 木は特に方向性が似ている細胞を優先
            if (recruit.socialTraits.goalOrientation > 0.5 || 
                recruit.type === 'wood' || 
                Math.random() < 0.3) {
                cell.group.addCell(recruit);
                
                // 勧誘の視覚効果
                const effect = new SocialEffect(
                    cell.x, cell.y, recruit.x, recruit.y, 
                    'positive', 0.8
                );
                socialInteractions.push(effect);
            }
        }
        
        // 目標達成のためにエネルギーを投資
        if (cell.energy > 60 && cell.group.goalProgress < 8) {
            cell.group.goalProgress += 0.2;
            cell.energy -= 0.5;
        }
    } else {
        // 一般メンバーとしての木
        // 木は積極的に目標に貢献
        if (cell.energy > 50 && Math.random() < 0.2) {
            cell.group.goalProgress += 0.05;
            cell.energy -= 0.2;
        }
    }
    
    // 木は衝突も辞さない - 他グループとの競争
    if (Math.random() < 0.05) {
        const neighborCells = getNeighboringCells(cell.x, cell.y);
        const rivalCells = neighborCells.filter(
            entity => entity instanceof Cell && 
            entity.group && 
            entity.group !== cell.group
        );
        
        if (rivalCells.length > 0) {
            const rival = rivalCells[Math.floor(Math.random() * rivalCells.length)];
            
            // 相剋関係ならより積極的に競争
            if (getFiveElementsRelation(cell.type, rival.type) === 'overrides') {
                rival.energy -= 0.5;
                cell.energy += 0.3;
                
                // 競争の視覚効果
                const effect = new SocialEffect(
                    cell.x, cell.y, rival.x, rival.y, 
                    'negative', 0.6
                );
                socialInteractions.push(effect);
            }
        }
    }
}

// 火の集団行動 - コミュニケーター・モチベーター・広報担当
function applyFireGroupBehavior(cell) {
    // 火は社交性が高く感情表現が豊か
    if (cell.isLeader) {
        // 火のリーダーはモチベーターとして機能
        for (const member of cell.group.cells) {
            if (member !== cell && Math.random() < 0.1) {
                // エネルギーを分配
                member.energy += 0.1;
                
                // 視覚的な効果
                if (Math.random() < 0.2) {
                    const effect = new SocialEffect(
                        cell.x, cell.y, member.x, member.y, 
                        'positive', 0.5
                    );
                    socialInteractions.push(effect);
                }
            }
        }
        
        // 火は活力に満ちた集団を好む
        if (cell.group.cells.length < 6 && Math.random() < 0.05) {
            // 新しいメンバーの勧誘を試みる
            const nearbyUnaffiliated = getNearbyUnaffiliatedCells(cell.x, cell.y, 5);
            if (nearbyUnaffiliated.length > 0) {
                const recruit = nearbyUnaffiliated[Math.floor(Math.random() * nearbyUnaffiliated.length)];
                
                // 外向的な細胞を優先
                if (recruit.socialTraits.extroversion > 0.5 || Math.random() < 0.3) {
                    cell.group.addCell(recruit);
                }
            }
        }
    } else {
        // 火のメンバーは雰囲気メーカー
        if (Math.random() < 0.1) {
            // グループ内のランダムなメンバーと交流
            if (cell.group.cells.length > 1) {
                const otherMember = cell.group.cells.find(m => m !== cell);
                if (otherMember) {
                    // 互いにエネルギーボーナス
                    otherMember.energy += 0.1;
                    cell.energy += 0.1;
                    
                    // グループの安定性を上げる
                    cell.group.stability += 0.01;
                    
                    // 視覚的な効果
                    if (Math.random() < 0.2) {
                        const effect = new SocialEffect(
                            cell.x, cell.y, otherMember.x, otherMember.y, 
                            'positive', 0.4
                        );
                        socialInteractions.push(effect);
                    }
                }
            }
        }
    }
    
    // 火は表現力が豊かでグループの団結力を高める
    if (Math.random() < 0.03) {
        cell.group.stability += 0.02;
    }
}

// 土の集団行動 - 調整役・支援者・世話役
function applyEarthGroupBehavior(cell) {
    // 土は人間関係を重視する調和の取れた存在
    if (cell.isLeader) {
        // 土のリーダーは全体の調和を重視
        
        // 体力の低いメンバーを支援
        const weakMembers = cell.group.cells.filter(m => m.energy < 30);
        for (const member of weakMembers) {
            if (cell.energy > 40 && Math.random() < 0.2) {
                // エネルギーを分け与える
                const transferAmount = Math.min(5, cell.energy * 0.1);
                cell.energy -= transferAmount;
                member.energy += transferAmount;
                
                // 視覚的な効果
                const effect = new SocialEffect(
                    cell.x, cell.y, member.x, member.y, 
                    'positive', 0.7
                );
                socialInteractions.push(effect);
            }
        }
        
        // 感染したメンバーのケア
        const infectedMembers = cell.group.cells.filter(m => m.infected > 0);
        for (const member of infectedMembers) {
            if (Math.random() < 0.1) {
                // 回復を助ける
                member.infected = Math.max(0, member.infected - 1);
                
                // 視覚的な効果
                const effect = new SocialEffect(
                    cell.x, cell.y, member.x, member.y, 
                    'positive', 0.6
                );
                socialInteractions.push(effect);
            }
        }
    } else {
        // 土のメンバーは和やかな雰囲気を作る
        if (Math.random() < 0.05) {
            // グループの安定性向上に貢献
            cell.group.stability += 0.01;
            
            // 近くのメンバーを支援
            const nearbyMembers = cell.group.cells.filter(m => 
                m !== cell && 
                Math.abs(m.x - cell.x) + Math.abs(m.y - cell.y) < 5
            );
            
            for (const member of nearbyMembers) {
                if (Math.random() < 0.2) {
                    member.lifespan += 0.1; // 寿命が少し延びる
                    
                    // 稀に視覚的な効果
                    if (Math.random() < 0.1) {
                        const effect = new SocialEffect(
                            cell.x, cell.y, member.x, member.y, 
                            'positive', 0.3
                        );
                        socialInteractions.push(effect);
                    }
                }
            }
        }
    }
    
    // 土は環境に応じた繁殖力調整
    if (cell.energy > 70 && cell.group.stability > 0.7 && Math.random() < 0.02) {
        // 安定したグループでは繁殖を促進
        cell.reproduce();
    }
}

// 金属の集団行動 - 監査役・法務担当・制度設計者
function applyMetalGroupBehavior(cell) {
    // 金属は規律と秩序を重んじる
    if (cell.isLeader) {
        // 金属のリーダーは規則正しいグループを構築
        
        // グループの防御力向上
        if (Math.random() < 0.05) {
            for (const member of cell.group.cells) {
                // 免疫力を高める
                if (!member.immunity && Math.random() < 0.1) {
                    member.immunity = true;
                    member.immunityTimer = 30;
                } else if (member.immunity && Math.random() < 0.2) {
                    member.immunityTimer += 10;
                }
            }
        }
        
        // 外部からの侵入に対抗
        const neighborCells = getNeighboringCells(cell.x, cell.y);
        const rivalCells = neighborCells.filter(
            entity => entity instanceof Cell && 
            (!entity.group || entity.group !== cell.group)
        );
        
        if (rivalCells.length > 0 && Math.random() < 0.1) {
            // 金属は境界を守る
            for (const rival of rivalCells) {
                // 相手にわずかなダメージ
                rival.energy -= 0.2;
                
                // 視覚的な効果
                const effect = new SocialEffect(
                    cell.x, cell.y, rival.x, rival.y, 
                    'negative', 0.5
                );
                socialInteractions.push(effect);
            }
        }
    } else {
        // 金属のメンバーは構造的な役割を担う
        
        // グループ内の相互関係を強化
        if (Math.random() < 0.03) {
            const nearbyMembers = cell.group.cells.filter(m => 
                m !== cell && 
                Math.abs(m.x - cell.x) + Math.abs(m.y - cell.y) < 4
            );
            
            for (const member of nearbyMembers) {
                if (Math.random() < 0.3) {
                    // 組織的なつながりの強化
                    cell.energy += 0.1;
                    member.energy += 0.1;
                    
                    // 視覚的な効果（稀に）
                    if (Math.random() < 0.1) {
                        const effect = new SocialEffect(
                            cell.x, cell.y, member.x, member.y, 
                            'positive', 0.4
                        );
                        socialInteractions.push(effect);
                    }
                }
            }
        }
    }
    
    // 金属は一定の組織構造を好む
    const optimalSize = cell.socialTraits.preferredGroupSize || 4;
    if (cell.group.cells.length > optimalSize + 2 && Math.random() < 0.05) {
        // 過大なグループの場合、分割を促進
        cell.group.stability -= 0.01;
    }
}

// 水の集団行動 - 研究者・戦略分析・裏方の参謀
function applyWaterGroupBehavior(cell) {
    // 水は柔軟で適応力が高い
    if (cell.isLeader) {
        // 水のリーダーは静かに集団を導く
        
        // 環境条件の観察と適応
        if (Math.random() < 0.1) {
            // 季節に適応した戦略
            if (currentSeason === cell.type) {
                // 自分の季節では拡大
                cell.group.goalProgress += 0.1;
            } else if (getOverridingElement(currentSeason) === cell.type) {
                // 不利な季節では防御的
                for (const member of cell.group.cells) {
                    member.energy += 0.1;
                }
            }
        }
        
        // 水は少数の深い関係を好む
        if (cell.group.cells.length > 5 && Math.random() < 0.1) {
            // 意図的に小規模を維持
            const weakestMember = [...cell.group.cells]
                .sort((a, b) => a.energy - b.energy)[0];
            
            if (weakestMember !== cell) {
                cell.group.removeCell(weakestMember);
            }
        }
    } else {
        // 水のメンバーは観察と直感で貢献
        
        // 環境変化への適応を助ける
        if (Math.random() < 0.05) {
            // 現在の季節に関する情報共有
            const nearbyMembers = cell.group.cells.filter(m => 
                m !== cell && 
                Math.abs(m.x - cell.x) + Math.abs(m.y - cell.y) < 5
            );
            
            for (const member of nearbyMembers) {
                if (member.type === currentSeason) {
                    // 季節に合ったタイプを支援
                    member.energy += 0.2;
                } else if (getOverridingElement(currentSeason) === member.type) {
                    // 不利なタイプを助ける
                    member.energy += 0.3;
                    
                    // 視覚的な効果
                    const effect = new SocialEffect(
                        cell.x, cell.y, member.x, member.y, 
                        'positive', 0.5
                    );
                    socialInteractions.push(effect);
                }
            }
        }
    }
    
    // 水は自己変革も厭わない
    if (cell.energy < 30 && Math.random() < 0.02) {
        // 危機的状況では型変更も
        const newType = getGeneratedElement(cell.type); // 相生関係の型へ
        cell.type = newType;
        cell.color = CELL_COLORS[newType];
        cell.shape = CELL_SHAPES[newType];
        cell.size = CELL_SIZES[newType];
        
        // 社会的特性も一部調整
        cell.socialTraits = {
            ...cell.socialTraits,
            ...SOCIAL_TRAITS[newType]
        };
        
        // 各特性を平均化
        for (const trait in cell.socialTraits) {
            if (SOCIAL_TRAITS[newType][trait] !== undefined) {
                cell.socialTraits[trait] = (cell.socialTraits[trait] + SOCIAL_TRAITS[newType][trait]) / 2;
            }
        }
        
        // エネルギー回復
        cell.energy += 10;
    }
}

// 近くの所属していない細胞を見つける補助関数
function getNearbyUnaffiliatedCells(x, y, radius) {
    const result = [];
    
    for (let dx = -radius; dx <= radius; dx++) {
        for (let dy = -radius; dy <= radius; dy++) {
            const nx = x + dx;
            const ny = y + dy;
            
            if (nx < 0 || ny < 0 || nx >= GRID_SIZE_X || ny >= GRID_SIZE_Y) continue;
            
            const entity = grid[ny][nx];
            if (entity instanceof Cell && !entity.group) {
                result.push(entity);
            }
        }
    }
    
    return result;
}

// Cell.prototype.considerGrouping の拡張実装
// 集団形成の決定プロセスをより型特性に合わせて調整
Cell.prototype.considerGrouping = function() {
    // 既にグループに所属している場合はスキップ
    if (this.group) return;
    
    // グループ形成のタイマーがある場合はスキップ
    if (this.groupingTimer > 0) {
        this.groupingTimer--;
        return;
    }
    
    // 型ごとの集団形成傾向の調整
    let groupingProbability = this.socialTraits.groupOrientation;
    
    // 型による調整
    switch (this.type) {
        case 'wood':
            // 木は目標を持つ集団を好む
            groupingProbability *= 1.2;
            break;
        case 'fire':
            // 火は活発な集団を好む
            groupingProbability *= this.socialTraits.extroversion;
            break;
        case 'earth':
            // 土は常に集団に入りたがる
            groupingProbability *= 1.5;
            break;
        case 'metal':
            // 金属は秩序ある集団のみを好む
            // 周囲に安定したグループがあるかチェック
            const neighborGroups = this.getNeighborGroups();
            const stableGroups = neighborGroups.filter(g => g.stability > 0.6);
            groupingProbability *= stableGroups.length > 0 ? 1.2 : 0.5;
            break;
        case 'water':
            // 水は深い関係の少人数グループのみを好む
            const smallGroups = this.getNeighborGroups().filter(g => g.cells.length < 4);
            groupingProbability *= smallGroups.length > 0 ? 1.0 : 0.3;
            break;
    }
    
    // 季節による調整
    if (this.type === currentSeason) {
        groupingProbability *= 1.2; // 自分の季節では集団形成が活発
    } else if (getOverridingElement(currentSeason) === this.type) {
        groupingProbability *= 0.8; // 不利な季節では集団形成を控える
    }
    
    // グループ形成を試みる
    if (Math.random() < groupingProbability) {
        this.tryJoinGroup();
    } else {
        // 次回の検討までのクールダウン
        this.groupingTimer = 20;
    }
};

// グループ加入を試みる
Cell.prototype.tryJoinGroup = function() {
    // 近くのグループを取得
    const neighborGroups = this.getNeighborGroups();
    
    if (neighborGroups.length > 0) {
        // グループの評価
        let bestGroup = null;
        let bestScore = -Infinity;
        
        for (const group of neighborGroups) {
            // このグループとの相性を評価
            const score = this.evaluateGroupCompatibility(group);
            
            if (score > bestScore) {
                bestScore = score;
                bestGroup = group;
            }
        }
        
        // 十分な相性があればグループに加入
        if (bestScore > 0 && bestGroup) {
            bestGroup.addCell(this);
            
            // 加入の視覚効果
            if (bestGroup.leader) {
                const effect = new SocialEffect(
                    this.x, this.y, bestGroup.leader.x, bestGroup.leader.y, 
                    'positive', 0.6
                );
                socialInteractions.push(effect);
            }
            return true;
        }
    }
    
    // グループに加入できなかった場合、新しいグループの形成を検討
    if (this.socialTraits.leadershipDrive > 0.5 && Math.random() < this.socialTraits.leadershipDrive * 0.3) {
        this.tryFormNewGroup();
        return true;
    }
    
    return false;
};

// 近隣のグループを取得
Cell.prototype.getNeighborGroups = function() {
    const radius = 5; // 検索範囲
    const nearbyEntities = [];
    
    for (let dx = -radius; dx <= radius; dx++) {
        for (let dy = -radius; dy <= radius; dy++) {
            const nx = this.x + dx;
            const ny = this.y + dy;
            
            if (nx < 0 || ny < 0 || nx >= GRID_SIZE_X || ny >= GRID_SIZE_Y) continue;
            
            const entity = grid[ny][nx];
            if (entity instanceof Cell && entity.group) {
                nearbyEntities.push(entity);
            }
        }
    }
    
    // ユニークなグループのみを返す
    const uniqueGroups = [];
    const groupIds = new Set();
    
    for (const entity of nearbyEntities) {
        if (!groupIds.has(entity.group)) {
            groupIds.add(entity.group);
            uniqueGroups.push(entity.group);
        }
    }
    
    return uniqueGroups;
};

// グループとの相性を評価
Cell.prototype.evaluateGroupCompatibility = function(group) {
    let score = 0;
    
    // 基本的な型の相性
    if (group.type === this.type) {
        score += 3; // 同じ型は高い相性
    } else if (getFiveElementsRelation(this.type, group.type) === 'generates') {
        score += 2; // 生成関係も良い相性
    } else if (getFiveElementsRelation(group.type, this.type) === 'generates') {
        score += 1; // 被生成関係もやや良い
    } else if (getFiveElementsRelation(this.type, group.type) === 'overrides') {
        score -= 1; // 抑制関係はやや悪い相性
    } else if (getFiveElementsRelation(group.type, this.type) === 'overrides') {
        score -= 2; // 被抑制関係は悪い相性
    }
    
    // グループサイズの好み
    const preferredSize = this.socialTraits.preferredGroupSize || 5;
    const sizeDifference = Math.abs(group.cells.length - preferredSize);
    
    if (sizeDifference <= 1) {
        score += 2; // ほぼ理想的なサイズ
    } else if (sizeDifference <= 3) {
        score += 1; // 許容範囲内
    } else if (sizeDifference >= 5) {
        score -= 2; // 大きく理想と異なる
    }
    
    // リーダーシップの適合性
    if (group.leader) {
        if (this.socialTraits.leadershipDrive > 0.7 && group.leader.socialTraits.leadershipDrive > 0.7) {
            score -= 3; // リーダー同士の衝突
        } else if (this.socialTraits.leadershipDrive < 0.3 && group.leader.socialTraits.leadershipDrive > 0.7) {
            score += 2; // フォロワーと強いリーダーの相性
        }
    } else if (this.socialTraits.leadershipDrive > 0.7) {
        score += 3; // リーダー不在でリーダーシップが強い場合は好機
    }
    
    // グループの安定性
    score += group.stability * 3;
    
    // 型ごとの特殊な条件
    switch (this.type) {
        case 'wood':
            // 木は発展性のあるグループを好む
            score += group.goalProgress;
            break;
        case 'fire':
            // 火は活発なグループを好む
            score += group.cells.length > 3 ? 1 : -1;
            break;
        case 'earth':
            // 土は調和のとれたグループを好む
            score += group.stability * 2;
            break;
        case 'metal':
            // 金属は秩序あるグループを好む
            score += group.stability > 0.7 ? 2 : -1;
            break;
        case 'water':
            // 水は小さく深いグループを好む
            score += group.cells.length < 4 ? 2 : -1;
            break;
    }
    
    return score;
};

// Cell.prototype.tryFormNewGroup の続き
Cell.prototype.tryFormNewGroup = function() {
    // リーダーシップが十分でない場合はスキップ
    if (this.socialTraits.leadershipDrive < 0.5) return false;
    
    // 近くの所属していない細胞を探す
    const unaffiliatedNeighbors = getNearbyUnaffiliatedCells(this.x, this.y, 4);
    
    // 型ごとの適合細胞フィルタリング
    let potentialMembers = [];
    
    switch (this.type) {
        case 'wood':
            // 木は目標志向の細胞を好む
            potentialMembers = unaffiliatedNeighbors.filter(cell => 
                cell.type === this.type || 
                getFiveElementsRelation(this.type, cell.type) === 'generates' ||
                cell.socialTraits.goalOrientation > 0.6
            );
            break;
        case 'fire':
            // 火は外向的な細胞を好む
            potentialMembers = unaffiliatedNeighbors.filter(cell => 
                cell.type === this.type || 
                cell.socialTraits.extroversion > 0.6
            );
            break;
        case 'earth':
            // 土は広く受け入れる
            potentialMembers = unaffiliatedNeighbors;
            break;
        case 'metal':
            // 金属は規律のある細胞を好む
            potentialMembers = unaffiliatedNeighbors.filter(cell => 
                cell.type === this.type || 
                cell.socialTraits.stability > 0.6
            );
            break;
        case 'water':
            // 水は少数の似た細胞のみを好む
            potentialMembers = unaffiliatedNeighbors.filter(cell => 
                cell.type === this.type || 
                cell.socialTraits.intuition > 0.6
            ).slice(0, 2); // 最大2つまで
            break;
    }
    
    // 十分なメンバーがいなければグループ形成を中止
    if (potentialMembers.length < 2) return false;
    
    // グループサイズの型別の好み
    let initialSize = 3; // デフォルト
    
    switch (this.type) {
        case 'wood': initialSize = 4; break;
        case 'fire': initialSize = 5; break;
        case 'earth': initialSize = 5; break;
        case 'metal': initialSize = 4; break;
        case 'water': initialSize = 3; break;
    }
    
    // グループの形成
    const newGroup = new CellGroup([this]);
    cellGroups.push(newGroup);
    
    // メンバーの追加（型ごとの好みのサイズに基づいて）
    const initialMembers = potentialMembers.slice(0, initialSize - 1);
    for (const cell of initialMembers) {
        newGroup.addCell(cell);
        
        // 加入の視覚効果
        const effect = new SocialEffect(
            this.x, this.y, cell.x, cell.y, 
            'positive', 0.7
        );
        socialInteractions.push(effect);
    }
    
    return true;
};

// 季節ごとの集団振る舞いを更新
function updateSeasonalGroupBehavior() {
    // 季節に応じた型の強化
    const favoredElement = currentSeason;
    const weakenedElement = getOverridingElement(currentSeason);
    
    // 各グループに季節効果を適用
    for (const group of cellGroups) {
        // 季節と一致する型のグループは強化
        if (group.type === favoredElement) {
            group.stability += 0.01;
            
            // グループメンバーの強化
            for (const cell of group.cells) {
                cell.energy += 0.1;
                
                // 季節に応じた特殊効果
                switch (favoredElement) {
                    case 'wood':
                        // 春には成長力が高まる
                        cell.reproductionRate *= 1.1;
                        break;
                    case 'fire':
                        // 夏には活動力が高まる
                        cell.activity *= 1.1;
                        break;
                    case 'earth':
                        // 長夏には安定性が高まる
                        if (cell.infected > 0) {
                            cell.infected--;
                        }
                        break;
                    case 'metal':
                        // 秋には防御力が高まる
                        if (!cell.immunity) {
                            cell.immunity = true;
                            cell.immunityTimer = 20;
                        }
                        break;
                    case 'water':
                        // 冬には適応力が高まる
                        cell.energy += 0.1;
                        break;
                }
            }
        }
        // 不利な季節の型のグループは弱化
        else if (group.type === weakenedElement) {
            group.stability -= 0.005;
            
            // グループメンバーの弱化
            for (const cell of group.cells) {
                cell.energy -= 0.05;
                
                // 季節に応じた不利効果
                switch (weakenedElement) {
                    case 'wood':
                        // 木は秋に弱化
                        cell.reproductionRate *= 0.9;
                        break;
                    case 'fire':
                        // 火は冬に弱化
                        cell.activity *= 0.9;
                        break;
                    case 'earth':
                        // 土は春に弱化
                        cell.lifespan -= 0.1;
                        break;
                    case 'metal':
                        // 金属は夏に弱化
                        // 免疫が早く切れる
                        if (cell.immunity) {
                            cell.immunityTimer -= 0.5;
                        }
                        break;
                    case 'water':
                        // 水は長夏に弱化
                        cell.energy -= 0.05;
                        break;
                }
            }
        }
    }
}

// 災害時の集団行動適応
function updateGroupsInDisaster() {
    if (!disasterActive) return;
    
    for (const group of cellGroups) {
        // 災害時のグループ応答（型ごとに異なる）
        switch (group.type) {
            case 'wood':
                // 木のグループは成長を一時停止し、生存に集中
                for (const cell of group.cells) {
                    cell.reproductionRate *= 0.5; // 繁殖率低下
                    cell.energy -= 0.1; // エネルギー消費
                }
                break;
                
            case 'fire':
                // 火のグループは活発さを維持するが消耗も激しい
                for (const cell of group.cells) {
                    cell.activity *= 1.2; // 活発になる
                    cell.energy -= 0.2; // エネルギー消費大
                }
                // グループのまとまりは低下
                group.stability -= 0.01;
                break;
                
            case 'earth':
                // 土のグループは凝集性を高め、互いを守る
                if (group.cells.length >= 3) {
                    group.stability += 0.01; // 安定性上昇
                    
                    // 互いにエネルギーを分け合う（弱いメンバーを支援）
                    const weakMembers = group.cells.filter(c => c.energy < 30);
                    const strongMembers = group.cells.filter(c => c.energy > 60);
                    
                    if (weakMembers.length > 0 && strongMembers.length > 0) {
                        for (const strong of strongMembers) {
                            for (const weak of weakMembers) {
                                const transfer = Math.min(5, strong.energy * 0.1);
                                strong.energy -= transfer;
                                weak.energy += transfer;
                                
                                // 視覚効果
                                if (Math.random() < 0.2) {
                                    const effect = new SocialEffect(
                                        strong.x, strong.y, weak.x, weak.y, 
                                        'positive', 0.5
                                    );
                                    socialInteractions.push(effect);
                                }
                                
                                break; // 一人だけ支援
                            }
                        }
                    }
                }
                break;
                
            case 'metal':
                // 金属のグループは防御態勢を強化
                group.stability += 0.005; // わずかに安定性上昇
                
                for (const cell of group.cells) {
                    // 免疫強化
                    if (!cell.immunity) {
                        if (Math.random() < 0.1) {
                            cell.immunity = true;
                            cell.immunityTimer = 30;
                        }
                    }
                    
                    // 活動低下でエネルギー温存
                    cell.activity *= 0.8;
                }
                break;
                
            case 'water':
                // 水のグループは適応力を発揮
                for (const cell of group.cells) {
                    // 変化への適応能力
                    if (cell.energy < 20 && Math.random() < 0.05) {
                        // 危機的状況で型変更も辞さない
                        const newType = getGeneratedElement(cell.type);
                        cell.type = newType;
                        cell.color = CELL_COLORS[newType];
                        cell.shape = CELL_SHAPES[newType];
                        cell.size = CELL_SIZES[newType];
                        cell.energy += 20; // エネルギー回復
                    }
                    
                    // エネルギー消費を減らす
                    cell.activity *= 0.7;
                }
                break;
        }
    }
}

// グループ内での相互作用を更新
CellGroup.prototype.updateInternalInteractions = function() {
    // グループ内での相互作用（型によって異なる）
    for (const cell of this.cells) {
        // 型別の集団行動を適用
        applyTypeSpecificGroupBehavior(cell);
    }
    
    // 細胞間の社会的結合の可視化（時折のみ）
    if (Math.random() < 0.01) {
        this.visualizeSocialBonds();
    }
};

// 社会的結合の可視化
CellGroup.prototype.visualizeSocialBonds = function() {
    // 細胞間のつながりの可視化（グループ構造を表現）
    if (this.cells.length < 3) return;
    
    // 表示する結合の数を制限
    const maxBonds = Math.min(this.cells.length * 2, 10);
    
    for (let i = 0; i < maxBonds; i++) {
        // ランダムな2細胞間の結合を表示
        const cell1 = this.cells[Math.floor(Math.random() * this.cells.length)];
        let cell2;
        do {
            cell2 = this.cells[Math.floor(Math.random() * this.cells.length)];
        } while (cell1 === cell2);
        
        // 型によって結合の性質が異なる
        let bondType = 'neutral';
        let intensity = 0.3;
        
        switch (this.type) {
            case 'wood':
                bondType = 'positive';
                intensity = 0.4;
                break;
            case 'fire':
                bondType = 'positive';
                intensity = 0.6;
                break;
            case 'earth':
                bondType = 'positive';
                intensity = 0.5;
                break;
            case 'metal':
                bondType = 'neutral';
                intensity = 0.4;
                break;
            case 'water':
                bondType = 'neutral';
                intensity = 0.3;
                break;
        }
        
        // 結合の視覚効果
        const effect = new SocialEffect(
            cell1.x, cell1.y, cell2.x, cell2.y, 
            bondType, intensity * this.stability
        );
        socialInteractions.push(effect);
    }
};

// 型ごとのリーダーシップスタイル
CellGroup.prototype.applyLeadershipStyle = function() {
    if (!this.leader) return;
    
    const leaderType = this.leader.type;
    
    // 型に基づくリーダーシップ行動
    switch (leaderType) {
        case 'wood':
            // 木のリーダーシップ：先導・推進
            if (Math.random() < 0.1) {
                // 目標を早めに達成
                this.goalProgress += 0.2;
                
                // グループを発展方向へ導く
                for (const member of this.cells) {
                    if (member !== this.leader && Math.random() < 0.3) {
                        // リーダーに向かって移動する傾向
                        const dx = Math.sign(this.leader.x - member.x);
                        const dy = Math.sign(this.leader.y - member.y);
                        
                        if (grid[member.y + dy]?.[member.x + dx] === null) {
                            grid[member.y][member.x] = null;
                            member.x += dx;
                            member.y += dy;
                            grid[member.y][member.x] = member;
                        }
                    }
                }
            }
            break;
            
        case 'fire':
            // 火のリーダーシップ：活性化・鼓舞
            if (Math.random() < 0.1) {
                // メンバーのエネルギーを高める
                for (const member of this.cells) {
                    if (member !== this.leader) {
                        member.activity *= 1.1;
                        member.energy += 0.2;
                        
                        // 視覚効果（まれに）
                        if (Math.random() < 0.1) {
                            const effect = new SocialEffect(
                                this.leader.x, this.leader.y, member.x, member.y, 
                                'positive', 0.5
                            );
                            socialInteractions.push(effect);
                        }
                    }
                }
            }
            break;
            
        case 'earth':
            // 土のリーダーシップ：調和・育成
            if (Math.random() < 0.1) {
                // グループの安定性向上
                this.stability += 0.02;
                
                // メンバーのケア
                for (const member of this.cells) {
                    if (member !== this.leader) {
                        if (member.infected > 0) {
                            member.infected--;
                        }
                        member.lifespan += 0.1;
                    }
                }
            }
            break;
            
        case 'metal':
            // 金属のリーダーシップ：規律・構造化
            if (Math.random() < 0.1) {
                // 構造を最適化（適切なサイズに調整）
                const optimalSize = this.leader.socialTraits.preferredGroupSize || 4;
                
                if (this.cells.length > optimalSize + 2) {
                    // 過大なグループを整理
                    const weakestMembers = [...this.cells]
                        .sort((a, b) => a.energy - b.energy)
                        .slice(0, this.cells.length - optimalSize);
                    
                    for (const member of weakestMembers) {
                        if (member !== this.leader) {
                            this.removeCell(member);
                        }
                    }
                }
                
                // 防御力強化
                for (const member of this.cells) {
                    if (!member.immunity && Math.random() < 0.1) {
                        member.immunity = true;
                        member.immunityTimer = 30;
                    }
                }
            }
            break;
            
        case 'water':
            // 水のリーダーシップ：適応・戦略
            if (Math.random() < 0.1) {
                // 環境に応じた適応
                for (const member of this.cells) {
                    if (member !== this.leader) {
                        // 季節に応じたエネルギー調整
                        if (member.type === currentSeason) {
                            member.energy += 0.5;
                        } else if (getOverridingElement(currentSeason) === member.type) {
                            member.energy += 1.0; // 不利な季節の仲間を特に支援
                        }
                    }
                }
                
                // 小さなグループを維持
                if (this.cells.length > 4) {
                    const leastCompatibleMember = [...this.cells]
                        .filter(m => m !== this.leader)
                        .sort((a, b) => a.socialTraits.intuition - b.socialTraits.intuition)[0];
                    
                    if (leastCompatibleMember) {
                        this.removeCell(leastCompatibleMember);
                    }
                }
            }
            break;
    }
};

// グループ更新関数の強化
CellGroup.prototype.update = function() {
    if (this.cells.length === 0) {
        return false; // グループは空になり削除されるべき
    }
    
    // 集団の結束力を計算
    this.calculateCohesion();
    
    // グループ目標の進行
    this.updateGroupGoal();
    
    // グループ内部の相互作用
    this.updateInternalInteractions();
    
    // リーダーシップ効果の適用
    this.applyLeadershipStyle();
    
    // 結束力が低いとグループが分裂する可能性
    if (this.stability < 0.2 && Math.random() < 0.1) {
        this.splitGroup();
        return false;
    }
    
    // グループメンバーへの影響
    this.influenceMembers();
    
    return true;
};

// 個体間の直接相互作用に型ごとの特性を反映
function applyElementalInteraction(cell1, cell2) {
    if (!cell1 || !cell2) return;
    
    // 基本相互作用（五行に基づく）
    const relation = getFiveElementsRelation(cell1.type, cell2.type);
    
    // 相互作用の強度
    let interactionIntensity = 0.5;
    
    // 型ごとの相互作用スタイル
    const style1 = getElementInteractionStyle(cell1.type);
    const style2 = getElementInteractionStyle(cell2.type);
    
    // 相互作用の型が一致すると効果増大
    if (style1 === style2) {
        interactionIntensity += 0.2;
    }
    
    // グループメンバーシップ考慮
    if (cell1.group && cell2.group) {
        if (cell1.group === cell2.group) {
            // 同じグループのメンバー間の相互作用強化
            interactionIntensity += 0.3;
        } else {
            // 異なるグループ間は関係性に依存
            interactionIntensity -= 0.1;
        }
    }
    
    // 関係に基づく効果
    if (relation === 'generates') {
        // 生成関係
        cell2.energy += 0.2 * interactionIntensity;
        cell1.energy -= 0.1 * interactionIntensity;
        
        // 相互作用の視覚効果
        if (Math.random() < 0.05) {
            const effect = new SocialEffect(
                cell1.x, cell1.y, cell2.x, cell2.y, 
                'positive', interactionIntensity
            );
            socialInteractions.push(effect);
        }
        
        // 社会的記憶に記録
        cell1.recordInteraction(cell2, 'positive');
        cell2.recordInteraction(cell1, 'positive');
        
    } else if (relation === 'overrides') {
        // 抑制関係
        cell2.energy -= 0.2 * interactionIntensity;
        cell1.energy += 0.1 * interactionIntensity;
        
        // 相互作用の視覚効果
        if (Math.random() < 0.05) {
            const effect = new SocialEffect(
                cell1.x, cell1.y, cell2.x, cell2.y, 
                'negative', interactionIntensity
            );
            socialInteractions.push(effect);
        }
        
        // 社会的記憶に記録
        cell1.recordInteraction(cell2, 'negative');
        cell2.recordInteraction(cell1, 'negative');
    }
}

// 型ごとの相互作用スタイルを定義
function getElementInteractionStyle(type) {
    switch (type) {
        case 'wood': return 'proactive';
        case 'fire': return 'expressive';
        case 'earth': return 'nurturing';
        case 'metal': return 'structured';
        case 'water': return 'adaptive';
        default: return 'neutral';
    }
}

// メインのupdateループに社会的行動を統合
function update() {
    // 既存の更新（季節、災害など）
    updateSeason();
    updateDisaster();
    
    // 社会システム更新
    updateSeasonalGroupBehavior();
    
    if (disasterActive) {
        updateGroupsInDisaster();
    }
    
    // グループ更新
    for (let i = cellGroups.length - 1; i >= 0; i--) {
        const isActive = cellGroups[i].update();
        if (!isActive || cellGroups[i].cells.length === 0) {
            cellGroups.splice(i, 1);
        }
    }
    
    // エンティティの更新（既存コード）
    // ウイルスの処理...
    
    // 細胞の処理...
    
    // 死骸の処理...
    
    // 社会的相互作用の視覚効果の更新
    for (let i = socialInteractions.length - 1; i >= 0; i--) {
        const isActive = socialInteractions[i].update();
        if (!isActive) {
            socialInteractions.splice(i, 1);
        }
    }
    
    // 時々新しいグループの形成を促進
    if (Math.random() < 0.01 && cells.length > 10) {
        tryFormNewGroup();
    }
    
    // 既存コードの続き...
    
    turn++;
    
    // 情報パネルの更新
    infoPanelUpdateCounter++;
    if (infoPanelUpdateCounter >= 10) {
        updateInfoPanel();
        infoPanelUpdateCounter = 0;
    } else {
        turnCounterDisplay.textContent = `Turn: ${turn}`;
    }
}

// HTMLコントロールパネルの拡張
function extendControlPanel() {
    // 社会行動関連コントロールの追加
    const socialControls = document.createElement('div');
    socialControls.className = 'control-group';
    socialControls.innerHTML = `
        <h3>社会行動設定</h3>
        <div class="control-item">
            <label for="groupFormationRate">集団形成率:</label>
            <input type="range" id="groupFormationRate" min="0" max="100" value="50">
            <span id="groupFormationValue">50%</span>
        </div>
        <div class="control-item">
            <label for="socialEffectIntensity">社会効果強度:</label>
            <input type="range" id="socialEffectIntensity" min="0" max="100" value="70">
            <span id="socialEffectValue">70%</span>
        </div>
        <div class="control-action">
            <button id="triggerSocialEvent">社会イベント発生</button>
            <button id="runSocialTest">社会的テスト実行</button>
        </div>
    `;
    
    controlsPanel.appendChild(socialControls);
    
    // スライダーのイベントリスナー
    const groupFormationSlider = document.getElementById('groupFormationRate');
    const groupFormationValueDisplay = document.getElementById('groupFormationValue');
    groupFormationSlider.addEventListener('input', () => {
        const value = parseInt(groupFormationSlider.value);
        groupFormationValueDisplay.textContent = `${value}%`;
        // グローバル変数で形成率を調整
        GLOBAL_GROUP_FORMATION_RATE = value / 100;
    });
    
    const socialEffectSlider = document.getElementById('socialEffectIntensity');
    const socialEffectValueDisplay = document.getElementById('socialEffectValue');
    socialEffectSlider.addEventListener('input', () => {
        const value = parseInt(socialEffectSlider.value);
        socialEffectValueDisplay.textContent = `${value}%`;
        // グローバル変数で効果強度を調整
        GLOBAL_SOCIAL_EFFECT_INTENSITY = value / 100;
    });
    
    // ボタンのイベントリスナー
    document.getElementById('triggerSocialEvent').addEventListener('click', () => {
        triggerSocialEvent(GLOBAL_SOCIAL_EFFECT_INTENSITY);
    });
    
    document.getElementById('runSocialTest').addEventListener('click', () => {
        runSocialTest();
    });
}

// 初期化関数の強化
function init() {
    // 既存の初期化
    resizeCanvas();
    entities = [];
    viruses = [];
    cells = [];
    corpses = [];
    disasterActive = false;
    disasterTimer = 0;
    yearTimer = 0;
    disasterYearCounter = 0;
    infoPanelUpdateCounter = 0;
    
    // 社会システム初期化
    cellGroups = [];
    socialInteractions = [];
    
    // グローバル社会設定
    GLOBAL_GROUP_FORMATION_RATE = 0.5;
    GLOBAL_SOCIAL_EFFECT_INTENSITY = 0.7;
    
    // 季節変数の初期化
    currentSeason = 'wood'; // 春から始める
    seasonTimer = 0;
    lastSeasonUpdateTime = performance.now() / 1000;

    // エンティティの初期化（既存コード）
    // ウイルスの初期配置...
    
    // 細胞の初期配置...
    
    turn = 0;
    turnCounterDisplay.textContent = `Turn: ${turn}`;
    updateInfoPanel();
    isRunning = false;
    
    // UIの拡張
    extendControlPanel();
}

// ゲーム開始時にUIを拡張
window.addEventListener('load', () => {
    init();
    draw();
});

// Cell.prototype.draw の続き
Cell.prototype.draw = function() {
    const drawX = this.x * CELL_SIZE;
    const drawY = this.y * CELL_SIZE;
    
    // サイズに基づくスケーリング
    const size = (this.size / 10) * CELL_SIZE;
    
    // 季節による脈動効果の調整
    let pulseAmplitude = 0.1;
    if (this.type === currentSeason) {
        pulseAmplitude = 0.2;
    } else if (getOverridingElement(currentSeason) === this.type) {
        pulseAmplitude = 0.05;
    }
    
    const pulseFactor = 1 + pulseAmplitude * Math.sin(this.pulsePhase);
    const finalSize = size * pulseFactor;
    
    // 中心からのオフセット計算
    const offsetX = (CELL_SIZE - finalSize) / 2;
    const offsetY = (CELL_SIZE - finalSize) / 2;
    
    ctx.fillStyle = this.color;
    ctx.beginPath();
    
    // 型による形状描画（既存のコード）
    switch (this.type) {
        case 'wood':
            // 木は葉や枝のような有機的な形に
            ctx.beginPath();
            const woodSegments = 5;
            for (let i = 0; i < woodSegments; i++) {
                const angle = (Math.PI * 2 * i) / woodSegments + this.pulsePhase * 0.1;
                const innerRadius = finalSize * 0.4;
                const outerRadius = finalSize * 0.7;
                
                const ix = drawX + CELL_SIZE/2 + Math.cos(angle) * innerRadius;
                const iy = drawY + CELL_SIZE/2 + Math.sin(angle) * innerRadius;
                const ox = drawX + CELL_SIZE/2 + Math.cos(angle) * outerRadius;
                const oy = drawY + CELL_SIZE/2 + Math.sin(angle) * outerRadius;
                
                if (i === 0) {
                    ctx.moveTo(ix, iy);
                } else {
                    ctx.lineTo(ix, iy);
                }
                ctx.lineTo(ox, oy);
            }
            ctx.closePath();
            ctx.fill();
            
            // 発光効果
            ctx.globalAlpha = 0.4;
            ctx.fillStyle = '#A5D6A7'; // 明るい緑の発光
            ctx.beginPath();
            ctx.arc(drawX + CELL_SIZE/2, drawY + CELL_SIZE/2, finalSize * 0.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1.0;
            break;
            
        case 'fire':
            // 火の炎を表現
            ctx.beginPath();
            const flameSegments = 7;
            for (let i = 0; i < flameSegments; i++) {
                const angle = (Math.PI * 2 * i) / flameSegments + this.pulsePhase * 0.3;
                const flameHeight = finalSize * (0.6 + Math.random() * 0.4);
                
                const fx = drawX + CELL_SIZE/2 + Math.cos(angle) * flameHeight;
                const fy = drawY + CELL_SIZE/2 + Math.sin(angle) * flameHeight;
                
                if (i === 0) {
                    ctx.moveTo(fx, fy);
                } else {
                    ctx.bezierCurveTo(
                        drawX + CELL_SIZE/2 + Math.cos(angle - 0.2) * flameHeight * 0.7,
                        drawY + CELL_SIZE/2 + Math.sin(angle - 0.2) * flameHeight * 0.7,
                        drawX + CELL_SIZE/2 + Math.cos(angle + 0.2) * flameHeight * 0.7,
                        drawY + CELL_SIZE/2 + Math.sin(angle + 0.2) * flameHeight * 0.7,
                        fx, fy
                    );
                }
            }
            ctx.closePath();
            ctx.fill();
            
            // 内側の発光
            ctx.globalAlpha = 0.7;
            const fireGradient = ctx.createRadialGradient(
                drawX + CELL_SIZE/2, drawY + CELL_SIZE/2, 0,
                drawX + CELL_SIZE/2, drawY + CELL_SIZE/2, finalSize * 0.8
            );
            fireGradient.addColorStop(0, '#FFEB3B'); // 黄色っぽい中心
            fireGradient.addColorStop(1, '#FF5722'); // オレンジの外側
            ctx.fillStyle = fireGradient;
            ctx.beginPath();
            ctx.arc(drawX + CELL_SIZE/2, drawY + CELL_SIZE/2, finalSize *0.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1.0;
            break;
            
        case 'earth':
            // 土は六角形の結晶構造
            ctx.beginPath();
            const earthSegments = 6;
            for (let i = 0; i < earthSegments; i++) {
                const angle = (Math.PI * 2 * i) / earthSegments;
                const ex = drawX + CELL_SIZE/2 + Math.cos(angle) * finalSize * 0.7;
                const ey = drawY + CELL_SIZE/2 + Math.sin(angle) * finalSize * 0.7;
                
                if (i === 0) {
                    ctx.moveTo(ex, ey);
                } else {
                    ctx.lineTo(ex, ey);
                }
            }
            ctx.closePath();
            ctx.fill();
            
            // テクスチャ表現
            ctx.strokeStyle = '#FFD54F'; // 明るい金色の線
            ctx.lineWidth = 1;
            ctx.stroke();
            
            // 中心部
            ctx.beginPath();
            ctx.arc(drawX + CELL_SIZE/2, drawY + CELL_SIZE/2, finalSize * 0.3, 0, Math.PI * 2);
            ctx.fillStyle = '#FFD54F';
            ctx.fill();
            break;
            
        case 'metal':
            // 金属は多面体
            ctx.beginPath();
            const metalSegments = 8;
            for (let i = 0; i < metalSegments; i++) {
                const angle = (Math.PI * 2 * i) / metalSegments + Math.PI / metalSegments;
                const mx = drawX + CELL_SIZE/2 + Math.cos(angle) * finalSize * 0.7;
                const my = drawY + CELL_SIZE/2 + Math.sin(angle) * finalSize * 0.7;
                
                if (i === 0) {
                    ctx.moveTo(mx, my);
                } else {
                    ctx.lineTo(mx, my);
                }
            }
            ctx.closePath();
            ctx.fill();
            
            // 金属光沢
            const metalGradient = ctx.createLinearGradient(
                drawX, drawY,
                drawX + CELL_SIZE, drawY + CELL_SIZE
            );
            metalGradient.addColorStop(0, 'rgba(255, 255, 255, 0.7)');
            metalGradient.addColorStop(0.5, 'rgba(255, 255, 255, 0)');
            metalGradient.addColorStop(1, 'rgba(255, 255, 255, 0.5)');
            
            ctx.fillStyle = metalGradient;
            ctx.fill();
            break;
            
        case 'water':
            // 水は流動的な波形
            ctx.beginPath();
            const waterSegments = 12;
            for (let i = 0; i < waterSegments; i++) {
                const angle = (Math.PI * 2 * i) / waterSegments + this.pulsePhase * 0.2;
                const waveHeight = finalSize * (0.5 + Math.sin(angle * 3) * 0.2);
                
                const wx = drawX + CELL_SIZE/2 + Math.cos(angle) * waveHeight;
                const wy = drawY + CELL_SIZE/2 + Math.sin(angle) * waveHeight;
                
                if (i === 0) {
                    ctx.moveTo(wx, wy);
                } else {
                    ctx.bezierCurveTo(
                        drawX + CELL_SIZE/2 + Math.cos(angle - 0.2) * (waveHeight + Math.sin(angle * 5 + this.pulsePhase) * finalSize * 0.1),
                        drawY + CELL_SIZE/2 + Math.sin(angle - 0.2) * (waveHeight + Math.sin(angle * 5 + this.pulsePhase) * finalSize * 0.1),
                        drawX + CELL_SIZE/2 + Math.cos(angle + 0.2) * (waveHeight + Math.sin(angle * 5 + this.pulsePhase) * finalSize * 0.1),
                        drawY + CELL_SIZE/2 + Math.sin(angle + 0.2) * (waveHeight + Math.sin(angle * 5 + this.pulsePhase) * finalSize * 0.1),
                        wx, wy
                    );
                }
            }
            ctx.closePath();
            ctx.fill();
            
            // 透明効果
            ctx.globalAlpha = 0.4;
            ctx.fillStyle = '#81D4FA'; // 明るい水色
            ctx.beginPath();
            ctx.arc(drawX + CELL_SIZE/2, drawY + CELL_SIZE/2, finalSize * 0.6, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1.0;
            break;
    }
    
    // 社会的特性の視覚的表現を追加
    
    // リーダーの視覚的表示
    if (this.isLeader) {
        // リーダーには型に応じた特別な表示
        ctx.strokeStyle = '#FFD700'; // 基本は金色
        ctx.lineWidth = 2;
        
        // 型ごとに異なるリーダー表示
        switch (this.type) {
            case 'wood':
                // 木のリーダーは星のような形
                ctx.beginPath();
                const starPoints = 5;
                for (let i = 0; i < starPoints * 2; i++) {
                    const radius = i % 2 === 0 ? finalSize * 0.7 : finalSize * 0.4;
                    const angle = (Math.PI * i) / starPoints;
                    const sx = drawX + CELL_SIZE/2 + Math.cos(angle) * radius;
                    const sy = drawY + CELL_SIZE/2 + Math.sin(angle) * radius;
                    
                    if (i === 0) {
                        ctx.moveTo(sx, sy);
                    } else {
                        ctx.lineTo(sx, sy);
                    }
                }
                ctx.closePath();
                ctx.stroke();
                break;
                
            case 'fire':
                // 火のリーダーは太陽のような形
                ctx.beginPath();
                ctx.arc(drawX + CELL_SIZE/2, drawY + CELL_SIZE/2, finalSize * 0.8, 0, Math.PI * 2);
                ctx.stroke();
                
                // 光線
                for (let i = 0; i < 8; i++) {
                    const angle = (Math.PI * 2 * i) / 8;
                    const innerRadius = finalSize * 0.8;
                    const outerRadius = finalSize * 1.1;
                    
                    ctx.beginPath();
                    ctx.moveTo(
                        drawX + CELL_SIZE/2 + Math.cos(angle) * innerRadius,
                        drawY + CELL_SIZE/2 + Math.sin(angle) * innerRadius
                    );
                    ctx.lineTo(
                        drawX + CELL_SIZE/2 + Math.cos(angle) * outerRadius,
                        drawY + CELL_SIZE/2 + Math.sin(angle) * outerRadius
                    );
                    ctx.stroke();
                }
                break;
                
            case 'earth':
                // 土のリーダーは円環
                ctx.beginPath();
                ctx.arc(drawX + CELL_SIZE/2, drawY + CELL_SIZE/2, finalSize * 0.8, 0, Math.PI * 2);
                ctx.stroke();
                
                ctx.beginPath();
                ctx.arc(drawX + CELL_SIZE/2, drawY + CELL_SIZE/2, finalSize * 0.6, 0, Math.PI * 2);
                ctx.stroke();
                break;
                
            case 'metal':
                // 金属のリーダーは盾のような形
                ctx.beginPath();
                ctx.moveTo(drawX + CELL_SIZE/2, drawY + CELL_SIZE/2 - finalSize * 0.8);
                ctx.lineTo(drawX + CELL_SIZE/2 + finalSize * 0.6, drawY + CELL_SIZE/2 - finalSize * 0.3);
                ctx.lineTo(drawX + CELL_SIZE/2 + finalSize * 0.6, drawY + CELL_SIZE/2 + finalSize * 0.3);
                ctx.lineTo(drawX + CELL_SIZE/2, drawY + CELL_SIZE/2 + finalSize * 0.8);
                ctx.lineTo(drawX + CELL_SIZE/2 - finalSize * 0.6, drawY + CELL_SIZE/2 + finalSize * 0.3);
                ctx.lineTo(drawX + CELL_SIZE/2 - finalSize * 0.6, drawY + CELL_SIZE/2 - finalSize * 0.3);
                ctx.closePath();
                ctx.stroke();
                break;
                
            case 'water':
                // 水のリーダーは円と波線
                ctx.beginPath();
                ctx.arc(drawX + CELL_SIZE/2, drawY + CELL_SIZE/2, finalSize * 0.7, 0, Math.PI * 2);
                ctx.stroke();
                
                // 波線
                ctx.beginPath();
                for (let i = 0; i < 20; i++) {
                    const x = drawX + i * CELL_SIZE/20;
                    const y = drawY + CELL_SIZE/2 + Math.sin(i * 0.5 + this.pulsePhase) * 3;
                    
                    if (i === 0) {
                        ctx.moveTo(x, y);
                    } else {
                        ctx.lineTo(x, y);
                    }
                }
                ctx.stroke();
                break;
        }
    }
    
    // グループに所属している場合の表示
    if (this.group) {
        // グループ所属を示す微かな輝き
        ctx.globalAlpha = 0.2 * this.group.stability;
        ctx.fillStyle = CELL_COLORS[this.group.type];
        ctx.beginPath();
        ctx.arc(drawX + CELL_SIZE/2, drawY + CELL_SIZE/2, finalSize * 1.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
    }
    
    // 感染状態の視覚効果を追加
    if (this.infected > 0) {
        ctx.globalAlpha = Math.min(0.7, this.infected / 15);
        ctx.fillStyle = VIRUS_COLORS[this.infectedBy] || 'rgba(255, 0, 255, 0.3)';
        ctx.beginPath();
        ctx.arc(drawX + CELL_SIZE/2, drawY + CELL_SIZE/2, finalSize * 0.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
    }
    
    // 免疫状態の視覚効果
    if (this.immunity) {
        ctx.globalAlpha = 0.3;
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(drawX + CELL_SIZE/2, drawY + CELL_SIZE/2, finalSize * 0.8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1.0;
    }
    
    // エネルギーレベルを示す発光効果
    const energyRatio = this.energy / 100;
    if (energyRatio > 0.7) {
        ctx.globalAlpha = 0.3 * energyRatio;
        ctx.beginPath();
        ctx.arc(drawX + CELL_SIZE/2, drawY + CELL_SIZE/2, finalSize * 0.7, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
    }
    
    // 現在の季節と一致するセルは特に輝く
    if (this.type === currentSeason) {
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = CELL_COLORS[this.type];
        ctx.beginPath();
        ctx.arc(drawX + CELL_SIZE/2, drawY + CELL_SIZE/2, finalSize * 1.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
    }
};

// 集団行動のデバッグ情報表示関数
function displayGroupDebugInfo() {
    if (cellGroups.length === 0) {
        console.log("現在グループはありません");
        return;
    }
    
    console.log(`=== グループ情報 (合計: ${cellGroups.length}グループ) ===`);
    
    // 型ごとのグループ数
    const groupsByType = {};
    CELL_TYPES.forEach(type => {
        groupsByType[type] = cellGroups.filter(g => g.type === type).length;
    });
    
    console.log("型ごとのグループ数:");
    for (const type in groupsByType) {
        console.log(`- ${type}: ${groupsByType[type]}グループ`);
    }
    
    // 大きなグループ情報
    const largeGroups = cellGroups.filter(g => g.cells.length >= 5);
    if (largeGroups.length > 0) {
        console.log(`\n大きなグループ (${largeGroups.length}個):`);
        
        largeGroups.forEach((group, index) => {
            console.log(`[${index + 1}] ${group.type}グループ: ${group.cells.length}メンバー, 安定度:${group.stability.toFixed(2)}, 目標進行:${group.goalProgress.toFixed(2)}`);
            
            // リーダー情報
            if (group.leader) {
                console.log(`  リーダー: ${group.leader.type}型, リーダーシップ:${group.leader.socialTraits.leadershipDrive.toFixed(2)}`);
            }
            
            // メンバー構成
            const memberCounts = {};
            CELL_TYPES.forEach(type => {
                memberCounts[type] = group.cells.filter(c => c.type === type).length;
            });
            
            console.log("  メンバー構成:");
            for (const type in memberCounts) {
                if (memberCounts[type] > 0) {
                    console.log(`  - ${type}: ${memberCounts[type]}細胞`);
                }
            }
        });
    } else {
        console.log("\n大きなグループはありません");
    }
    
    console.log("=====================");
}

// UI機能：デバッグモード切り替え
function addDebugModeToggle() {
    const debugControls = document.createElement('div');
    debugControls.className = 'control-group';
    debugControls.innerHTML = `
        <h3>デバッグ設定</h3>
        <div class="control-item">
            <label for="debugMode">デバッグモード:</label>
            <input type="checkbox" id="debugMode">
        </div>
        <div id="debugControls" style="display:none;">
            <button id="displayGroupInfo">グループ情報表示</button>
            <button id="highlightGroups">グループ強調表示</button>
            <button id="forceGroupFormation">グループ形成促進</button>
        </div>
    `;
    
    controlsPanel.appendChild(debugControls);
    
    // チェックボックスのイベントリスナー
    const debugModeCheckbox = document.getElementById('debugMode');
    const debugControlsPanel = document.getElementById('debugControls');
    
    debugModeCheckbox.addEventListener('change', () => {
        if (debugModeCheckbox.checked) {
            debugControlsPanel.style.display = 'block';
            DEBUG_MODE = true;
        } else {
            debugControlsPanel.style.display = 'none';
            DEBUG_MODE = false;
        }
    });
    
    // デバッグボタンのイベントリスナー
    document.getElementById('displayGroupInfo').addEventListener('click', () => {
        displayGroupDebugInfo();
    });
    
    document.getElementById('highlightGroups').addEventListener('click', () => {
        HIGHLIGHT_GROUPS = !HIGHLIGHT_GROUPS;
    });
    
    document.getElementById('forceGroupFormation').addEventListener('click', () => {
        // 強制的にグループ形成を促進
        for (let i = 0; i < 5; i++) {
            tryFormNewGroup();
        }
    });
}

// グローバル設定を追加
let DEBUG_MODE = false;
let HIGHLIGHT_GROUPS = false;
let GLOBAL_GROUP_FORMATION_RATE = 0.5;
let GLOBAL_SOCIAL_EFFECT_INTENSITY = 0.7;

// 季節変化のイベント処理
function handleSeasonChange(oldSeason, newSeason) {
    console.log(`季節が変化: ${ELEMENT_SEASONS[oldSeason]} → ${ELEMENT_SEASONS[newSeason]}`);
    
    // 季節変化によるグループへの影響
    for (const group of cellGroups) {
        // 新しい季節が自分の型と一致する場合は強化
        if (group.type === newSeason) {
            group.stability += 0.2;
            group.goalProgress += 2;
            
            // 視覚効果
            for (const cell of group.cells) {
                // 季節の恩恵を受ける細胞を強調表示
                if (Math.random() < 0.3) {
                    const effect = new SocialEffect(
                        cell.x, cell.y, cell.x, cell.y, 
                        'positive', 0.8
                    );
                    effect.type = 'seasonal'; // 季節効果タイプ
                    socialInteractions.push(effect);
                }
            }
        }
        // 相剋関係の型の場合は弱化
        else if (getOverridingElement(newSeason) === group.type) {
            group.stability -= 0.1;
            
            // 相剋関係の視覚効果
            if (group.leader) {
                const effect = new SocialEffect(
                    group.leader.x, group.leader.y, group.leader.x + 1, group.leader.y + 1, 
                    'negative', 0.6
                );
                effect.type = 'seasonal'; // 季節効果タイプ
                socialInteractions.push(effect);
            }
        }
    }
    
    // 季節に応じたグループの行動パターン変化
    for (const cell of cells) {
        // 季節変化に応じて細胞の社会的特性を一時的に調整
        if (cell.type === newSeason) {
            // その季節の型は社会的特性が強化される
            cell.socialTraits.groupOrientation *= 1.2;
            cell.socialTraits.leadershipDrive *= 1.1;
            cell.socialTraits.extroversion *= 1.1;
            
            // 特性の上限を保証
            for (const trait in cell.socialTraits) {
                cell.socialTraits[trait] = Math.min(1, cell.socialTraits[trait]);
            }
        } else if (getOverridingElement(newSeason) === cell.type) {
            // 不利な季節では群れる傾向が強まる
            cell.socialTraits.groupOrientation *= 1.3;
            cell.socialTraits.groupOrientation = Math.min(1, cell.socialTraits.groupOrientation);
        }
    }
}

// updateSeason関数の拡張
function updateSeason() {
    // 現在時刻を取得
    const currentTime = performance.now() / 1000; // 秒単位
    const deltaTime = currentTime - lastSeasonUpdateTime;
    lastSeasonUpdateTime = currentTime;
    
    // 季節タイマーを更新
    seasonTimer += deltaTime;
    yearTimer += deltaTime;
    
    // 1年のサイクルで管理
    if (yearTimer >= yearTotalTime) {
        yearTimer = 0;
        disasterYearCounter++;
        
        // 3年に1回程度の頻度で災害発生
        if (disasterYearCounter >= 3 && Math.random() < 0.5) {
            startDisaster();
            disasterYearCounter = 0;
        }
    }
    
    // 季節の切り替え
    if (seasonTimer >= seasonTime) {
        const oldSeason = currentSeason;
        seasonTimer = 0;
        
        // 次の季節に移行
        const seasonOrder = ['wood', 'fire', 'earth', 'metal', 'water'];
        const currentIndex = seasonOrder.indexOf(currentSeason);
        const nextIndex = (currentIndex + 1) % seasonOrder.length;
        currentSeason = seasonOrder[nextIndex];
        
        // 季節変化によるイベント処理
        handleSeasonChange(oldSeason, currentSeason);
        
        console.log(`Season changed: ${ELEMENT_SEASONS[currentSeason]}`);
    }
}

// 大規模イベント：社会革命
// triggerSocialRevolution の続き
function triggerSocialRevolution() {
    console.log("社会革命イベント発生!");
    
    // 一定規模以上のグループを対象
    const largeGroups = cellGroups.filter(g => g.cells.length >= 6);
    
    if (largeGroups.length === 0) return;
    
    for (const group of largeGroups) {
        // 革命の影響度合いはリーダーの特性に依存
        let revolutionChance = 0.5;
        
        if (group.leader) {
            // 型によるリーダーシップスタイルの影響
            switch (group.leader.type) {
                case 'wood':
                    // 木のリーダーは変革を推進
                    revolutionChance += 0.2;
                    break;
                case 'fire':
                    // 火のリーダーは熱狂的
                    revolutionChance += 0.3;
                    break;
                case 'earth':
                    // 土のリーダーは保守的
                    revolutionChance -= 0.2;
                    break;
                case 'metal':
                    // 金属のリーダーは秩序重視
                    revolutionChance -= 0.3;
                    break;
                case 'water':
                    // 水のリーダーは適応的
                    if (group.stability < 0.5) {
                        revolutionChance += 0.2; // 不安定なら変化を好む
                    } else {
                        revolutionChance -= 0.1; // 安定していれば現状維持
                    }
                    break;
            }
        }
        
        // グループの安定性も影響
        revolutionChance = Math.max(0.1, Math.min(0.9, revolutionChance));
        
        if (Math.random() < revolutionChance) {
            // 革命が起きる
            
            // リーダーが変わる可能性
            if (group.cells.length >= 2 && Math.random() < 0.7) {
                // 現在のリーダーを除外
                const leaderCandidates = group.cells.filter(c => c !== group.leader);
                
                // リーダーシップが高い順にソート
                leaderCandidates.sort((a, b) => 
                    b.socialTraits.leadershipDrive - a.socialTraits.leadershipDrive
                );
                
                if (leaderCandidates.length > 0) {
                    // 新しいリーダーを選出
                    const newLeader = leaderCandidates[0];
                    
                    if (group.leader) {
                        group.leader.isLeader = false;
                    }
                    
                    group.leader = newLeader;
                    newLeader.isLeader = true;
                    
                    // リーダー交代の視覚効果
                    const effect = new SocialEffect(
                        newLeader.x, newLeader.y, newLeader.x, newLeader.y, 
                        'positive', 0.9
                    );
                    socialInteractions.push(effect);
                    
                    // グループ全体への影響
                    for (const member of group.cells) {
                        if (member !== newLeader) {
                            // メンバーと新リーダーの相互作用
                            const relation = getFiveElementsRelation(newLeader.type, member.type);
                            
                            if (relation === 'generates') {
                                // 相生関係なら協力的
                                member.energy += 5;
                                const effect = new SocialEffect(
                                    newLeader.x, newLeader.y, member.x, member.y, 
                                    'positive', 0.7
                                );
                                socialInteractions.push(effect);
                            } else if (relation === 'overrides') {
                                // 相剋関係なら抑圧的
                                member.energy -= 3;
                                const effect = new SocialEffect(
                                    newLeader.x, newLeader.y, member.x, member.y, 
                                    'negative', 0.7
                                );
                                socialInteractions.push(effect);
                            }
                        }
                    }
                }
            }
            
            // グループの型が変わる可能性
            if (Math.random() < 0.3) {
                // 新しい型を決定（リーダーの型に影響される）
                let newType;
                
                if (group.leader && Math.random() < 0.7) {
                    // リーダーの型に合わせる
                    newType = group.leader.type;
                } else {
                    // ランダムな型
                    newType = CELL_TYPES[Math.floor(Math.random() * CELL_TYPES.length)];
                }
                
                // グループの型を変更
                const oldType = group.type;
                group.type = newType;
                
                console.log(`グループが変化: ${oldType} → ${newType}`);
                
                // 型変化の視覚効果
                for (const member of group.cells) {
                    if (Math.random() < 0.3) {
                        const effect = new SocialEffect(
                            member.x, member.y, member.x, member.y, 
                            'neutral', 0.6
                        );
                        socialInteractions.push(effect);
                    }
                }
            }
            
            // 革命後の安定性変化
            group.stability = Math.max(0.2, group.stability - 0.3);
            
            // 目標のリセット
            group.goalProgress = 0;
        }
    }
}

// 集団の目標達成イベント
function handleGroupGoalAchievement(group) {
    console.log(`${group.type}型グループが目標を達成!`);
    
    // 型ごとの目標達成効果
    switch (group.type) {
        case 'wood':
            // 木の目標：拡張・成長
            // 新メンバーの獲得や周囲への影響力拡大
            
            // 新メンバーの勧誘
            const unaffiliatedNeighbors = [];
            for (const cell of group.cells) {
                const neighbors = getNearbyUnaffiliatedCells(cell.x, cell.y, 5);
                unaffiliatedNeighbors.push(...neighbors);
            }
            
            // 重複を除去
            const uniqueNeighbors = [...new Set(unaffiliatedNeighbors)];
            
            // 新メンバー追加（最大3人）
            const recruits = uniqueNeighbors.slice(0, 3);
            for (const recruit of recruits) {
                group.addCell(recruit);
                
                // 勧誘の視覚効果
                if (group.leader) {
                    const effect = new SocialEffect(
                        group.leader.x, group.leader.y, recruit.x, recruit.y, 
                        'positive', 0.8
                    );
                    socialInteractions.push(effect);
                }
            }
            
            // メンバーの強化
            for (const member of group.cells) {
                member.energy += 10;
                member.reproductionRate *= 1.2;
            }
            break;
            
        case 'fire':
            // 火の目標：情熱・表現
            // グループのエネルギー上昇と活動性向上
            
            // 全メンバーの活性化
            for (const member of group.cells) {
                member.energy += 15;
                member.activity *= 1.3;
                
                // 活性化の視覚効果
                const effect = new SocialEffect(
                    member.x, member.y, member.x, member.y, 
                    'positive', 0.9
                );
                socialInteractions.push(effect);
            }
            
            // 周囲への影響
            for (const member of group.cells) {
                const neighborCells = getNeighboringCells(member.x, member.y);
                for (const neighbor of neighborCells) {
                    if (neighbor instanceof Cell && neighbor.group !== group) {
                        neighbor.energy += 5;
                        
                        // 影響の視覚効果
                        const effect = new SocialEffect(
                            member.x, member.y, neighbor.x, neighbor.y, 
                            'positive', 0.6
                        );
                        socialInteractions.push(effect);
                    }
                }
            }
            break;
            
        case 'earth':
            // 土の目標：調和・安定
            // グループの安定性向上と防御力強化
            
            // 安定性の大幅向上
            group.stability = Math.min(1.0, group.stability + 0.3);
            
            // メンバーの体力回復と免疫獲得
            for (const member of group.cells) {
                member.energy = Math.min(100, member.energy + 20);
                member.lifespan += 20;
                
                // 感染の治癒
                if (member.infected > 0) {
                    member.infected = 0;
                }
                
                // 免疫獲得
                if (!member.immunity) {
                    member.immunity = true;
                    member.immunityTimer = 100;
                } else {
                    member.immunityTimer += 50;
                }
                
                // 回復の視覚効果
                const effect = new SocialEffect(
                    member.x, member.y, member.x, member.y, 
                    'positive', 0.8
                );
                socialInteractions.push(effect);
            }
            break;
            
        case 'metal':
            // 金属の目標：秩序・防御
            // 防御力と構造の最適化
            
            // 全メンバーの防御強化
            for (const member of group.cells) {
                // 免疫力強化
                if (!member.immunity) {
                    member.immunity = true;
                    member.immunityTimer = 150;
                } else {
                    member.immunityTimer += 100;
                }
                
                // 体力と寿命の増加
                member.energy = Math.min(100, member.energy + 15);
                member.lifespan += 30;
                
                // 強化の視覚効果
                const effect = new SocialEffect(
                    member.x, member.y, member.x, member.y, 
                    'neutral', 0.7
                );
                socialInteractions.push(effect);
            }
            
            // グループ構造の最適化
            const optimalSize = group.leader ? 
                group.leader.socialTraits.preferredGroupSize : 5;
            
            if (group.cells.length > optimalSize + 2) {
                // 過剰なメンバーの整理
                const excessMembers = group.cells.length - optimalSize;
                const weakestMembers = [...group.cells]
                    .filter(c => c !== group.leader)
                    .sort((a, b) => a.energy - b.energy)
                    .slice(0, excessMembers);
                
                for (const member of weakestMembers) {
                    group.removeCell(member);
                }
            }
            break;
            
        case 'water':
            // 水の目標：適応・変化
            // 変化への適応力向上
            
            // 各メンバーに適応能力付与
            for (const member of group.cells) {
                member.energy += 10;
                
                // 変異能力の強化
                member.mutationFactor = (member.mutationFactor || 1) * 1.5;
                
                // 季節への適応
                if (currentSeason !== member.type) {
                    // 現在の季節に有利な特性を一時的に獲得
                    if (currentSeason === 'wood') {
                        member.reproductionRate *= 1.2; // 成長力
                    } else if (currentSeason === 'fire') {
                        member.activity *= 1.2; // 活動性
                    } else if (currentSeason === 'earth') {
                        member.lifespan += 10; // 安定性
                    } else if (currentSeason === 'metal') {
                        if (!member.immunity) {
                            member.immunity = true;
                            member.immunityTimer = 50;
                        }
                    } else if (currentSeason === 'water') {
                        member.energy += 10; // 適応力
                    }
                }
                
                // 適応の視覚効果
                const effect = new SocialEffect(
                    member.x, member.y, member.x, member.y, 
                    'neutral', 0.7
                );
                socialInteractions.push(effect);
            }
            
            // グループ全体の適応性向上
            group.stability = Math.min(1.0, group.stability + 0.1);
            break;
    }
    
    // 目標達成後のリセット
    group.goalProgress = 0;
}

// CellGroup.prototype.updateGroupGoal の拡張
CellGroup.prototype.updateGroupGoal = function() {
    // 各要素型に基づく目標進行
    switch (this.type) {
        case 'wood':
            // 木のグループは拡張と成長が目標
            this.goalProgress += 0.01 * this.cells.length * this.stability;
            break;
            
        case 'fire':
            // 火のグループはエネルギーと交流が目標
            this.goalProgress += 0.02 * this.cells.length * this.stability;
            break;
            
        case 'earth':
            // 土のグループは安定と調和が目標
            this.goalProgress += 0.005 * this.cells.length * this.stability;
            break;
            
        case 'metal':
            // 金属のグループは構造と防御が目標
            this.goalProgress += 0.008 * this.cells.length * this.stability;
            break;
            
        case 'water':
            // 水のグループは適応と流動性が目標
            this.goalProgress += 0.015 * this.cells.length * this.stability;
            break;
    }
    
    // 目標達成判定
    if (this.goalProgress >= 10) {
        handleGroupGoalAchievement(this);
    }
};

// セルの社会的記憶を可視化する機能
function visualizeCellSocialMemory(cell) {
    if (!cell || !cell.socialMemory || cell.socialMemory.length === 0) {
        console.log("この細胞には社会的記憶がありません");
        return;
    }
    
    console.log(`=== 細胞の社会的記憶 (${cell.type}型) ===`);
    console.log(`記憶数: ${cell.socialMemory.length}`);
    
    // 型ごとの印象を集計
    const impressionsByType = {};
    for (const type of CELL_TYPES) {
        impressionsByType[type] = {
            positive: 0,
            negative: 0,
            total: 0
        };
    }
    
    // 記憶の解析
    for (const memory of cell.socialMemory) {
        const type = memory.cellType;
        const impression = memory.outcome;
        
        if (!impressionsByType[type]) {
            impressionsByType[type] = {
                positive: 0,
                negative: 0,
                total: 0
            };
        }
        
        if (impression > 0) {
            impressionsByType[type].positive++;
        } else if (impression < 0) {
            impressionsByType[type].negative++;
        }
        
        impressionsByType[type].total++;
    }
    
    // 結果表示
    console.log("型ごとの印象:");
    for (const type in impressionsByType) {
        if (impressionsByType[type].total > 0) {
            const positive = impressionsByType[type].positive;
            const negative = impressionsByType[type].negative;
            const total = impressionsByType[type].total;
            
            const positivePercentage = Math.round((positive / total) * 100);
            const negativePercentage = Math.round((negative / total) * 100);
            
            console.log(`- ${type}: ${positivePercentage}%正, ${negativePercentage}%負 (全${total}件)`);
        }
    }
    
    // グループメンバーシップ
    if (cell.group) {
        console.log(`\nグループ所属: ${cell.group.type}型グループ (${cell.group.cells.length}メンバー)`);
        if (cell.isLeader) {
            console.log("役割: リーダー");
        } else {
            console.log("役割: メンバー");
        }
    } else {
        console.log("\nグループ所属: なし");
    }
    
    // 社会的特性
    console.log("\n社会的特性:");
    for (const trait in cell.socialTraits) {
        const value = cell.socialTraits[trait];
        console.log(`- ${trait}: ${value.toFixed(2)}`);
    }
    
    console.log("=========================");
}

// グループ内の社会的役割を分析
function analyzeGroupRoles(group) {
    if (!group || group.cells.length < 3) {
        console.log("分析するには十分な規模のグループではありません");
        return;
    }
    
    console.log(`=== グループ役割分析 (${group.type}型, ${group.cells.length}メンバー) ===`);
    
    // メンバーの社会的特性に基づいて役割を識別
    const roleAssignments = {};
    
    for (const cell of group.cells) {
        // リーダーの場合
        if (cell === group.leader) {
            roleAssignments[cell.id] = "リーダー";
            continue;
        }
        
        // 社会的特性に基づく役割判定
        if (cell.socialTraits.leadershipDrive > 0.7) {
            roleAssignments[cell.id] = "サブリーダー";
        } else if (cell.socialTraits.nurturing > 0.7) {
            roleAssignments[cell.id] = "サポーター";
        } else if (cell.socialTraits.extroversion > 0.7) {
            roleAssignments[cell.id] = "コミュニケーター";
        } else if (cell.socialTraits.structureNeed > 0.7) {
            roleAssignments[cell.id] = "オーガナイザー";
        } else if (cell.socialTraits.intuition > 0.7) {
            roleAssignments[cell.id] = "アドバイザー";
        } else if (cell.socialTraits.groupOrientation > 0.7) {
            roleAssignments[cell.id] = "コア・メンバー";
        } else {
            roleAssignments[cell.id] = "一般メンバー";
        }
    }
    
    // 役割の集計
    const roleCounts = {};
    for (const cellId in roleAssignments) {
        const role = roleAssignments[cellId];
        roleCounts[role] = (roleCounts[role] || 0) + 1;
    }
    
    console.log("役割分布:");
    for (const role in roleCounts) {
        console.log(`- ${role}: ${roleCounts[role]}細胞`);
    }
    
    // 型ごとの分布
    const typeDistribution = {};
    for (const cell of group.cells) {
        typeDistribution[cell.type] = (typeDistribution[cell.type] || 0) + 1;
    }
    
    console.log("\n型分布:");
    for (const type in typeDistribution) {
        const percentage = Math.round((typeDistribution[type] / group.cells.length) * 100);
        console.log(`- ${type}: ${typeDistribution[type]}細胞 (${percentage}%)`);
    }
    
    // グループの特徴分析
    console.log("\nグループ特性:");
    console.log(`- 安定性: ${group.stability.toFixed(2)}`);
    console.log(`- 目標進行: ${group.goalProgress.toFixed(2)} / 10`);
    
    // 多様性スコア計算
    const diversityScore = 1 - Object.values(typeDistribution)
        .reduce((max, count) => Math.max(max, count / group.cells.length), 0);
    console.log(`- 多様性スコア: ${(diversityScore * 100).toFixed(0)}%`);
    
    // 社会的結束力の推定
    const cohesionFactors = {
        leaderPresence: group.leader ? 0.3 : 0,
        stability: group.stability * 0.3,
        diversity: diversityScore * 0.2,
        seasonalAlignment: group.type === currentSeason ? 0.2 : 0
    };
    
    const cohesionScore = Object.values(cohesionFactors).reduce((sum, factor) => sum + factor, 0);
    console.log(`- 結束力スコア: ${(cohesionScore * 100).toFixed(0)}%`);
    
    console.log("================================");
}

// グローバル状態の監視と突発的イベントトリガー
function monitorGlobalState() {
    // ターンカウンターに基づくイベント発生
    if (turn % 500 === 0 && turn > 0) {
        // 大規模な社会イベント発生
        if (Math.random() < 0.3) {
            triggerSocialRevolution();
        }
    }
    
    // 集団密度の監視
    if (cells.length > 200 && cellGroups.length > 5) {
        // 高密度状態での集団競争
        if (Math.random() < 0.01) {
            triggerGroupCompetition();
        }
    }
    
    // 季節変化時の特殊イベント
    if (seasonTimer < 1 && Math.random() < 0.5) {
        // 季節の始まりに特殊イベント
        triggerSeasonalEvent();
    }
}

// 集団競争イベント
function triggerGroupCompetition() {
    // 十分な規模のグループが2つ以上必要
    const largeGroups = cellGroups.filter(g => g.cells.length >= 5);
    
    if (largeGroups.length < 2) return;
    
    console.log("集団競争イベント発生!");
    
    // 2つのグループをランダムに選択
    const group1 = largeGroups[Math.floor(Math.random() * largeGroups.length)];
    let group2;
    do {
        group2 = largeGroups[Math.floor(Math.random() * largeGroups.length)];
    } while (group2 === group1);
    
    // 競争の結果を決定
    const strength1 = calculateGroupStrength(group1);
    const strength2 = calculateGroupStrength(group2);
    
    console.log(`競争: ${group1.type}グループ(強さ:${strength1.toFixed(2)}) vs ${group2.type}グループ(強さ:${strength2.toFixed(2)})`);
    
    // 視覚効果
    if (group1.leader && group2.leader) {
        const effect = new SocialEffect(
            group1.leader.x, group1.leader.y, 
            group2.leader.x, group2.leader.y, 
            'negative', 0.9
        );
        socialInteractions.push(effect);
    }
    
    // 勝者と敗者の決定
    let winner, loser;
    if (strength1 > strength2) {
        winner = group1;
        loser = group2;
    } else {
        winner = group2;
        loser = group1;
    }
    
    // 競争の結果の適用
    
    // 勝者の強化
    winner.stability += 0.1;
    winner.goalProgress += 2;
    
    for (const cell of winner.cells) {
        cell.energy += 5;
        
        // 勝利の視覚効果
        if (Math.random() < 0.3) {
            const effect = new SocialEffect(
                cell.x, cell.y, cell.x, cell.y, 
                'positive', 0.7
            );
            socialInteractions.push(effect);
        }
    }
    
    // 敗者の弱体化
    loser.stability -= 0.2;
    
    for (const cell of loser.cells) {
        cell.energy -= 3;
        
        // 敗北の視覚効果
        if (Math.random() < 0.3) {
            const effect = new SocialEffect(
                cell.x, cell.y, cell.x, cell.y, 
                'negative', 0.7
            );
            socialInteractions.push(effect);
        }
    }
    
    // 敗者のグループから一部のメンバーが勝者のグループに移籍する可能性
    if (Math.random() < 0.5) {
        const defectors = Math.min(2, Math.floor(loser.cells.length * 0.2));
        
        for (let i = 0; i < defectors; i++) {
            if (loser.cells.length <= 3) break; // あまりに小さくなりすぎないように
            
            // ランダムなメンバー（リーダー以外）を選択
            const candidates = loser.cells.filter(c => c !== loser.leader);
            if (candidates.length === 0) break;
            
            const defector = candidates[Math.floor(Math.random() * candidates.length)];
            
            // グループ移籍
            loser.removeCell(defector);
            winner.addCell(defector);
            
            // 移籍の視覚効果
            if (winner.leader) {
                const effect = new SocialEffect(
                    defector.x, defector.y, winner.leader.x, winner.leader.y, 
                    'neutral', 0.8
                );
                socialInteractions.push(effect);
            }
        }
    }
    
    console.log(`競争結果: ${winner.type}グループが勝利!`);
}

// グループの強さを計算
function calculateGroupStrength(group) {
    if (!group || group.cells.length === 0) return 0;
    
    let strength = 0;
    
    // 基本要素
    strength += group.cells.length * 0.5; // グループサイズ
    strength += group.stability * 5; // 安定性
    
    // リーダーの影響
    if (group.leader) {
        strength += group.leader.socialTraits.leadershipDrive * 2;
        strength += (group.leader.energy / 100) * 1.5;
    }
    
    // メンバーの累積エネルギー
    const totalEnergy = group.cells.reduce((sum, cell) => sum + cell.energy, 0);
    strength += totalEnergy / 100;
    
    // 季節との相性
    if (group.type === currentSeason) {
        strength *= 1.3; // 自分の季節では強い
    } else if (getOverridingElement(currentSeason) === group.type) {
        strength *= 0.7; // 不利な季節では弱い
    }
    
    // 型に応じた特性
    switch (group.type) {
        case 'wood':
            // 木は拡張性で強さを得る
            strength += group.goalProgress * 0.7;
            break;
        case 'fire':
            // 火は活発さで強さを得る
            const avgActivity = group.cells.reduce((sum, cell) => sum + cell.activity, 0) / group.cells.length;
            strength += avgActivity * 5;
            break;
        case 'earth':
            // 土は調和で強さを得る
            const typeVariety = new Set(group.cells.map(c => c.type)).size;
            strength += typeVariety;
            break;
        case 'metal':
            // 金属は防御力で強さを得る
            const immuneCount = group.cells.filter(c => c.immunity).length;
            strength += (immuneCount / group.cells.length) * 3;
            break;
        case 'water':
            // 水は適応力で強さを得る
            if (disasterActive) {
                strength *= 1.5; // 災害時に強い
            }
            break;
    }
    
    return strength;
}

// 季節イベント
// triggerSeasonalEvent の続き
function triggerSeasonalEvent() {
    console.log(`${ELEMENT_SEASONS[currentSeason]}の季節イベント発生!`);
    
    // 季節ごとの特殊イベント
    switch (currentSeason) {
        case 'wood':
            // 春の発芽 - 繁殖率上昇
            for (const cell of cells) {
                if (cell.type === 'wood') {
                    cell.reproductionRate *= 1.5;
                    
                    // 発芽の視覚効果
                    const effect = new SocialEffect(
                        cell.x, cell.y, cell.x, cell.y, 
                        'positive', 0.8
                    );
                    socialInteractions.push(effect);
                }
            }
            
            // 木のグループ特別効果
            for (const group of cellGroups) {
                if (group.type === 'wood') {
                    group.goalProgress += 2;
                    
                    // 新メンバー勧誘の促進
                    if (group.leader) {
                        const unaffiliatedNeighbors = getNearbyUnaffiliatedCells(
                            group.leader.x, group.leader.y, 10
                        );
                        
                        // 最大2人を勧誘
                        const recruits = unaffiliatedNeighbors.slice(0, 2);
                        for (const recruit of recruits) {
                            group.addCell(recruit);
                        }
                    }
                }
            }
            break;
            
        case 'fire':
            // 夏の活発化 - 活動性上昇
            for (const cell of cells) {
                if (cell.type === 'fire') {
                    cell.activity *= 1.5;
                    cell.energy += 10;
                    
                    // 活性化の視覚効果
                    const effect = new SocialEffect(
                        cell.x, cell.y, cell.x, cell.y, 
                        'positive', 0.8
                    );
                    socialInteractions.push(effect);
                }
            }
            
            // 火のグループ特別効果 - 熱狂的な交流
            for (const group of cellGroups) {
                if (group.type === 'fire') {
                    // グループ内の交流促進
                    for (let i = 0; i < Math.min(10, group.cells.length); i++) {
                        const cell1 = group.cells[Math.floor(Math.random() * group.cells.length)];
                        const cell2 = group.cells[Math.floor(Math.random() * group.cells.length)];
                        
                        if (cell1 !== cell2) {
                            cell1.energy += 2;
                            cell2.energy += 2;
                            
                            // 交流の視覚効果
                            const effect = new SocialEffect(
                                cell1.x, cell1.y, cell2.x, cell2.y, 
                                'positive', 0.7
                            );
                            socialInteractions.push(effect);
                        }
                    }
                }
            }
            break;
            
        case 'earth':
            // 長夏の豊穣 - 安定性と回復力向上
            for (const cell of cells) {
                if (cell.type === 'earth') {
                    cell.energy = Math.min(100, cell.energy + 20);
                    cell.lifespan += 10;
                    
                    // 回復の視覚効果
                    const effect = new SocialEffect(
                        cell.x, cell.y, cell.x, cell.y, 
                        'positive', 0.8
                    );
                    socialInteractions.push(effect);
                }
            }
            
            // 土のグループ特別効果 - 調和と育成
            for (const group of cellGroups) {
                if (group.type === 'earth') {
                    group.stability = Math.min(1.0, group.stability + 0.3);
                    
                    // グループメンバーの状態改善
                    for (const cell of group.cells) {
                        if (cell.infected > 0) {
                            cell.infected = 0; // 感染回復
                        }
                        
                        cell.energy = Math.min(100, cell.energy + 10);
                    }
                }
            }
            break;
            
        case 'metal':
            // 秋の収穫 - 防御力と構造の強化
            for (const cell of cells) {
                if (cell.type === 'metal') {
                    // 免疫獲得
                    if (!cell.immunity) {
                        cell.immunity = true;
                        cell.immunityTimer = 100;
                    } else {
                        cell.immunityTimer += 50;
                    }
                    
                    // 防御強化の視覚効果
                    const effect = new SocialEffect(
                        cell.x, cell.y, cell.x, cell.y, 
                        'neutral', 0.8
                    );
                    socialInteractions.push(effect);
                }
            }
            
            // 金属のグループ特別効果 - 構造最適化
            for (const group of cellGroups) {
                if (group.type === 'metal') {
                    // 組織構造の強化
                    group.stability = Math.min(1.0, group.stability + 0.2);
                    
                    // 弱いメンバーの整理と強いメンバーの強化
                    if (group.cells.length > 4) {
                        // メンバーをエネルギー順にソート
                        const sortedMembers = [...group.cells].sort((a, b) => b.energy - a.energy);
                        
                        // 上位半分を強化
                        const topHalf = sortedMembers.slice(0, Math.floor(sortedMembers.length / 2));
                        for (const cell of topHalf) {
                            cell.energy = Math.min(100, cell.energy + 15);
                            
                            // 強化の視覚効果
                            const effect = new SocialEffect(
                                cell.x, cell.y, cell.x, cell.y, 
                                'positive', 0.7
                            );
                            socialInteractions.push(effect);
                        }
                        
                        // 下位1/4を除外（リーダー以外）
                        if (group.cells.length >= 8) {
                            const bottomQuarter = sortedMembers
                                .slice(Math.floor(sortedMembers.length * 3 / 4))
                                .filter(cell => cell !== group.leader);
                            
                            for (const cell of bottomQuarter) {
                                group.removeCell(cell);
                            }
                        }
                    }
                }
            }
            break;
            
        case 'water':
            // 冬の静寂 - 適応力と変化
            for (const cell of cells) {
                if (cell.type === 'water') {
                    cell.energy += 15;
                    cell.infected = 0; // 感染回復
                    
                    // 適応の視覚効果
                    const effect = new SocialEffect(
                        cell.x, cell.y, cell.x, cell.y, 
                        'neutral', 0.8
                    );
                    socialInteractions.push(effect);
                }
            }
            
            // 水のグループ特別効果 - 冬の隠遁と適応
            for (const group of cellGroups) {
                if (group.type === 'water') {
                    // グループの適応能力向上
                    for (const cell of group.cells) {
                        // 突然変異能力向上
                        cell.mutationFactor = (cell.mutationFactor || 1) * 1.5;
                        
                        // まれに型変化
                        if (Math.random() < 0.1) {
                            // 相性の良い型へ変化
                            const newType = getGeneratedElement(cell.type);
                            cell.type = newType;
                            cell.color = CELL_COLORS[newType];
                            cell.shape = CELL_SHAPES[newType];
                            cell.size = CELL_SIZES[newType];
                            
                            // 変化の視覚効果
                            const effect = new SocialEffect(
                                cell.x, cell.y, cell.x, cell.y, 
                                'neutral', 0.9
                            );
                            socialInteractions.push(effect);
                        }
                    }
                }
            }
            break;
    }
}

// 情報パネル更新関数のさらなる拡張
function updateInfoPanel() {
    // 既存のウイルス情報と基本データの表示...
    
    // 社会的システム情報の追加
    const socialInfoHTML = `
        <div style="margin-top: 15px; border-top: 1px solid #444;">
            <div style="font-weight: bold; margin-top: 5px;">社会システム情報</div>
            <div>グループ数: ${cellGroups.length}</div>
            <div>平均グループサイズ: ${cellGroups.length > 0 ? 
                (cellGroups.reduce((sum, g) => sum + g.cells.length, 0) / cellGroups.length).toFixed(1) : 0}</div>
            <div>最大グループサイズ: ${cellGroups.length > 0 ? 
                Math.max(...cellGroups.map(g => g.cells.length)) : 0}</div>
            <div>社会的つながり: ${socialInteractions.length}</div>
        </div>
    `;
    
    // 季節情報のスタイル強化
    const seasonProgressPercent = Math.round((seasonTimer / seasonTime) * 100);
    const yearProgressPercent = Math.round((yearTimer / yearTotalTime) * 100);
    
    const seasonColor = CELL_COLORS[currentSeason];
    const seasonInfoHTML = `
        <div style="margin-top: 10px; border-top: 1px solid #444;">
            <div style="font-weight: bold; color: ${seasonColor};">${ELEMENT_SEASONS[currentSeason]}</div>
            <div class="progress-bar" style="width: 100%; height: 8px; background: #333; border-radius: 4px; margin-top: 5px;">
                <div style="width: ${seasonProgressPercent}%; height: 100%; background: ${seasonColor}; border-radius: 4px;"></div>
            </div>
            <div style="font-size: 0.8em; margin-top: 3px;">${Math.floor(seasonTimer)}s / ${seasonTime}s</div>
            
            <div style="margin-top: 8px;">年進行:</div>
            <div class="progress-bar" style="width: 100%; height: 8px; background: #333; border-radius: 4px; margin-top: 5px;">
                <div style="width: ${yearProgressPercent}%; height: 100%; background: #555; border-radius: 4px;"></div>
            </div>
            <div style="font-size: 0.8em; margin-top: 3px;">${Math.floor(yearTimer)}s / ${yearTotalTime}s</div>
        </div>
    `;
    
    // 情報パネルに追加
    document.getElementById('seasonDisplay').innerHTML = seasonInfoHTML;
    
    // 既存のHTMLに社会情報を追加
    populationBarsDisplay.innerHTML += socialInfoHTML;
    
    // 災害情報の表示を改善
    if (disasterActive) {
        const disasterInfoHTML = `
            <div style="margin-top: 10px; color: #ff5555; font-weight: bold; padding: 5px; border: 1px solid #ff5555; border-radius: 4px;">
                ⚠️ 災害発生中: 残り${disasterTimer}ターン
                <div class="progress-bar" style="width: 100%; height: 5px; background: #331111; border-radius: 2px; margin-top: 5px;">
                    <div style="width: ${(disasterTimer / 200) * 100}%; height: 100%; background: #ff5555; border-radius: 2px;"></div>
                </div>
            </div>
        `;
        
        populationBarsDisplay.innerHTML += disasterInfoHTML;
    }
}

// グループの移動パターンの実装
CellGroup.prototype.updateMovementPattern = function() {
    // 必要なリーダーがいない場合はスキップ
    if (!this.leader) return;
    
    // 型に基づく集団移動パターン
    switch (this.type) {
        case 'wood':
            // 木のグループは前進的、目標に向かって進む
            this.moveTowardGoal();
            break;
            
        case 'fire':
            // 火のグループは活発に動き回る
            this.moveEnergetically();
            break;
            
        case 'earth':
            // 土のグループは安定した場所に留まる
            this.moveStably();
            break;
            
        case 'metal':
            // 金属のグループは秩序ある形成を維持
            this.moveInFormation();
            break;
            
        case 'water':
            // 水のグループは流動的に環境に適応
            this.moveAdaptively();
            break;
    }
};

// 目標に向かって進む（木のパターン）
CellGroup.prototype.moveTowardGoal = function() {
    // グループの目標地点の設定
    if (!this.targetX || !this.targetY || Math.random() < 0.05) {
        // 新しい目標を設定（画面の端に向かう傾向）
        const edgeChoice = Math.floor(Math.random() * 4);
        
        switch (edgeChoice) {
            case 0: // 上端
                this.targetX = GRID_SIZE_X / 2;
                this.targetY = 0;
                break;
            case 1: // 右端
                this.targetX = GRID_SIZE_X - 1;
                this.targetY = GRID_SIZE_Y / 2;
                break;
            case 2: // 下端
                this.targetX = GRID_SIZE_X / 2;
                this.targetY = GRID_SIZE_Y - 1;
                break;
            case 3: // 左端
                this.targetX = 0;
                this.targetY = GRID_SIZE_Y / 2;
                break;
        }
    }
    
    // リーダーを目標方向に移動
    const dx = Math.sign(this.targetX - this.leader.x);
    const dy = Math.sign(this.targetY - this.leader.y);
    
    const newX = Math.max(0, Math.min(GRID_SIZE_X - 1, this.leader.x + dx));
    const newY = Math.max(0, Math.min(GRID_SIZE_Y - 1, this.leader.y + dy));
    
    if (grid[newY][newX] === null) {
        grid[this.leader.y][this.leader.x] = null;
        this.leader.x = newX;
        this.leader.y = newY;
        grid[this.leader.y][this.leader.x] = this.leader;
    }
    
    // メンバーもリーダーの方向に引っ張られる
    for (const cell of this.cells) {
        if (cell !== this.leader && Math.random() < 0.3) {
            const dx = Math.sign(this.leader.x - cell.x);
            const dy = Math.sign(this.leader.y - cell.y);
            
            const newX = Math.max(0, Math.min(GRID_SIZE_X - 1, cell.x + dx));
            const newY = Math.max(0, Math.min(GRID_SIZE_Y - 1, cell.y + dy));
            
            if (grid[newY][newX] === null) {
                grid[cell.y][cell.x] = null;
                cell.x = newX;
                cell.y = newY;
                grid[cell.y][cell.x] = cell;
            }
        }
    }
};

// 活発に動き回る（火のパターン）
CellGroup.prototype.moveEnergetically = function() {
    // リーダーはランダムに活発に動く
    if (Math.random() < 0.7) {
        const dx = Math.floor(Math.random() * 3) - 1;
        const dy = Math.floor(Math.random() * 3) - 1;
        
        const newX = Math.max(0, Math.min(GRID_SIZE_X - 1, this.leader.x + dx));
        const newY = Math.max(0, Math.min(GRID_SIZE_Y - 1, this.leader.y + dy));
        
        if (grid[newY][newX] === null) {
            grid[this.leader.y][this.leader.x] = null;
            this.leader.x = newX;
            this.leader.y = newY;
            grid[this.leader.y][this.leader.x] = this.leader;
        }
    }
    
    // メンバーも活発に動くが、ある程度グループとして維持
    for (const cell of this.cells) {
        if (cell !== this.leader && Math.random() < 0.5) {
            let dx, dy;
            
            // 一定確率でリーダー方向へ
            if (Math.random() < 0.3) {
                dx = Math.sign(this.leader.x - cell.x);
                dy = Math.sign(this.leader.y - cell.y);
            } else {
                // それ以外はランダム
                dx = Math.floor(Math.random() * 3) - 1;
                dy = Math.floor(Math.random() * 3) - 1;
            }
            
            const newX = Math.max(0, Math.min(GRID_SIZE_X - 1, cell.x + dx));
            const newY = Math.max(0, Math.min(GRID_SIZE_Y - 1, cell.y + dy));
            
            if (grid[newY][newX] === null) {
                grid[cell.y][cell.x] = null;
                cell.x = newX;
                cell.y = newY;
                grid[cell.y][cell.x] = cell;
            }
        }
    }
};

// 安定した場所に留まる（土のパターン）
CellGroup.prototype.moveStably = function() {
    // リーダーはあまり動かない
    if (Math.random() < 0.2) {
        const dx = Math.floor(Math.random() * 3) - 1;
        const dy = Math.floor(Math.random() * 3) - 1;
        
        const newX = Math.max(0, Math.min(GRID_SIZE_X - 1, this.leader.x + dx));
        const newY = Math.max(0, Math.min(GRID_SIZE_Y - 1, this.leader.y + dy));
        
        if (grid[newY][newX] === null) {
            grid[this.leader.y][this.leader.x] = null;
            this.leader.x = newX;
            this.leader.y = newY;
            grid[this.leader.y][this.leader.x] = this.leader;
        }
    }
    
    // メンバーはリーダーの近くに集まる傾向
    for (const cell of this.cells) {
        if (cell !== this.leader && Math.random() < 0.3) {
            // リーダーとの距離が大きい場合のみ動く
            const distance = Math.abs(cell.x - this.leader.x) + Math.abs(cell.y - this.leader.y);
            
            if (distance > 3) {
                const dx = Math.sign(this.leader.x - cell.x);
                const dy = Math.sign(this.leader.y - cell.y);
                
                const newX = Math.max(0, Math.min(GRID_SIZE_X - 1, cell.x + dx));
                const newY = Math.max(0, Math.min(GRID_SIZE_Y - 1, cell.y + dy));
                
                if (grid[newY][newX] === null) {
                    grid[cell.y][cell.x] = null;
                    cell.x = newX;
                    cell.y = newY;
                    grid[cell.y][cell.x] = cell;
                }
            }
        }
    }
};

// 隊列を組んで動く（金属のパターン）
CellGroup.prototype.moveInFormation = function() {
    // リーダーは計画的に動く
    if (Math.random() < 0.4) {
        // 目標地点がなければ設定
        if (!this.formationTarget || Math.random() < 0.05) {
            this.formationTarget = {
                x: Math.floor(Math.random() * GRID_SIZE_X),
                y: Math.floor(Math.random() * GRID_SIZE_Y)
            };
        }
        
        // 目標に向かって移動
        const dx = Math.sign(this.formationTarget.x - this.leader.x);
        const dy = Math.sign(this.formationTarget.y - this.leader.y);
        
        const newX = Math.max(0, Math.min(GRID_SIZE_X - 1, this.leader.x + dx));
        const newY = Math.max(0, Math.min(GRID_SIZE_Y - 1, this.leader.y + dy));
        
        if (grid[newY][newX] === null) {
            grid[this.leader.y][this.leader.x] = null;
            this.leader.x = newX;
            this.leader.y = newY;
            grid[this.leader.y][this.leader.x] = this.leader;
        }
    }
    
    // メンバーは隊列を組む
    const formation = this.calculateFormation();
    
    let index = 0;
    for (const cell of this.cells) {
        if (cell !== this.leader && index < formation.length && Math.random() < 0.4) {
            const position = formation[index];
            
            // 目標位置に向かって移動
            const targetX = this.leader.x + position.dx;
            const targetY = this.leader.y + position.dy;
            
            // 範囲内に収める
            const boundedX = Math.max(0, Math.min(GRID_SIZE_X - 1, targetX));
            const boundedY = Math.max(0, Math.min(GRID_SIZE_Y - 1, targetY));
            
            // 少しずつその方向に移動
            const dx = Math.sign(boundedX - cell.x);
            const dy = Math.sign(boundedY - cell.y);
            
            const newX = Math.max(0, Math.min(GRID_SIZE_X - 1, cell.x + dx));
            const newY = Math.max(0, Math.min(GRID_SIZE_Y - 1, cell.y + dy));
            
            if (grid[newY][newX] === null) {
                grid[cell.y][cell.x] = null;
                cell.x = newX;
                cell.y = newY;
                grid[cell.y][cell.x] = cell;
            }
            
            index++;
        }
    }
};

// 隊列形成の計算
CellGroup.prototype.calculateFormation = function() {
    const formation = [];
    const rows = Math.ceil(Math.sqrt(this.cells.length));
    
    // グリッド状の隊列
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < rows; c++) {
            if (r === 0 && c === 0) continue; // リーダーの位置はスキップ
            
            formation.push({
                dx: c - Math.floor(rows / 2),
                dy: r - Math.floor(rows / 2)
            });
            
            if (formation.length >= this.cells.length - 1) {
                return formation;
            }
        }
    }
    
    return formation;
};

// 流動的に適応して動く（水のパターン）
CellGroup.prototype.moveAdaptively = function() {
    // 環境状況に合わせて戦略を変更
    let strategy;
    
    if (disasterActive) {
        strategy = 'escape'; // 災害時は逃げる
    } else if (this.cells.length < 4) {
        strategy = 'gather'; // 少人数時は集まる
    } else if (Math.random() < 0.3) {
        strategy = 'explore'; // 時々探索
    } else {
        strategy = 'flow'; // 基本は流れに乗る
    }
    
    // 戦略に基づいた動き
    switch (strategy) {
        case 'escape':
            // 災害から逃げる
            // 中央から遠ざかる
            const centerX = GRID_SIZE_X / 2;
            const centerY = GRID_SIZE_Y / 2;
            
            for (const cell of this.cells) {
                if (Math.random() < 0.6) {
                    const dx = cell.x < centerX ? -1 : 1;
                    const dy = cell.y < centerY ? -1 : 1;
                    
                    const newX = Math.max(0, Math.min(GRID_SIZE_X - 1, cell.x + dx));
                    const newY = Math.max(0, Math.min(GRID_SIZE_Y - 1, cell.y + dy));
                    
                    if (grid[newY][newX] === null) {
                        grid[cell.y][cell.x] = null;
                        cell.x = newX;
                        cell.y = newY;
                        grid[cell.y][cell.x] = cell;
                    }
                }
            }
            break;
            
        case 'gather':
            // 集まる
            if (this.leader) {
                for (const cell of this.cells) {
                    if (cell !== this.leader && Math.random() < 0.7) {
                        const dx = Math.sign(this.leader.x - cell.x);
                        const dy = Math.sign(this.leader.y - cell.y);
                        
                        const newX = Math.max(0, Math.min(GRID_SIZE_X - 1, cell.x + dx));
                        const newY = Math.max(0, Math.min(GRID_SIZE_Y - 1, cell.y + dy));
                        
                        if (grid[newY][newX] === null) {
                            grid[cell.y][cell.x] = null;
                            cell.x = newX;
                            cell.y = newY;
                            grid[cell.y][cell.x] = cell;
                        }
                    }
                }
            }
            break;
            
        case 'explore':
            // 探索（リーダーが先導）
            if (this.leader && Math.random() < 0.8) {
                const dx = Math.floor(Math.random() * 3) - 1;
                const dy = Math.floor(Math.random() * 3) - 1;
                
                const newX = Math.max(0, Math.min(GRID_SIZE_X - 1, this.leader.x + dx));
                const newY = Math.max(0, Math.min(GRID_SIZE_Y - 1, this.leader.y + dy));
                
                if (grid[newY][newX] === null) {
                    grid[this.leader.y][this.leader.x] = null;
                    this.leader.x = newX;
                    this.leader.y = newY;
                    grid[this.leader.y][this.leader.x] = this.leader;
                }
            }
            break;
            
        case 'flow':
            // 流れるような動き
            for (const cell of this.cells) {
                if (Math.random() < 0.4) {
                    // 波のような動き
                    const angle = (turn / 10) + (cell.x * 0.1);
                    const dx = Math.round(Math.cos(angle));
                    const dy = Math.round(Math.sin(angle));
                    
                    const newX = Math.max(0, Math.min(GRID_SIZE_X - 1, cell.x + dx));
                    const newY = Math.max(0, Math.min(GRID_SIZE_Y - 1, cell.y + dy));
                    
                    if (grid[newY][newX] === null) {
                        grid[cell.y][cell.x] = null;
                        cell.x = newX;
                        cell.y = newY;
                        grid[cell.y][cell.x] = cell;
                    }
                }
            }
            break;
    }
};

// update関数への組み込み
// update関数への組み込み（続き）
function update() {
    // 既存の更新（季節、災害など）...
    
    // 社会システム更新
    updateSeasonalGroupBehavior();
    
    if (disasterActive) {
        updateGroupsInDisaster();
    }
    
    // グローバル状態監視とイベント発生
    monitorGlobalState();
    
    // グループ更新
    for (let i = cellGroups.length - 1; i >= 0; i--) {
        const isActive = cellGroups[i].update();
        
        // グループの移動パターンの更新
        if (isActive && Math.random() < 0.1) { // 10%の確率で移動パターンを実行
            cellGroups[i].updateMovementPattern();
        }
        
        if (!isActive || cellGroups[i].cells.length === 0) {
            cellGroups.splice(i, 1);
        }
    }
    
    // エンティティの更新...
    
    // 社会的相互作用の視覚効果の更新
    for (let i = socialInteractions.length - 1; i >= 0; i--) {
        const isActive = socialInteractions[i].update();
        if (!isActive) {
            socialInteractions.splice(i, 1);
        }
    }
    
    // 時々新しいグループの形成を促進
    if (Math.random() < 0.01 && cells.length > 10) {
        tryFormNewGroup();
    }
    
    // 既存コードの続き...
    
    turn++;
    
    // 情報パネルの更新
    infoPanelUpdateCounter++;
    if (infoPanelUpdateCounter >= 10) {
        updateInfoPanel();
        infoPanelUpdateCounter = 0;
    } else {
        turnCounterDisplay.textContent = `Turn: ${turn}`;
    }
}

// 統計データの記録と分析
let simulationStats = {
    turnRecords: [],
    groupStats: [],
    populationStats: [],
    eventLog: []
};

// 統計データを記録する関数
function recordSimulationStats() {
    // 一定間隔でのみ記録（パフォーマンス考慮）
    if (turn % 50 !== 0) return;
    
    // 細胞数の記録
    const populationByType = {};
    for (const type of CELL_TYPES) {
        populationByType[type] = cells.filter(c => c.type === type).length;
    }
    
    simulationStats.populationStats.push({
        turn: turn,
        totalCells: cells.length,
        byType: { ...populationByType },
        virusCount: viruses.length,
        corpseCount: corpses.length
    });
    
    // グループ統計の記録
    const groupsByType = {};
    for (const type of CELL_TYPES) {
        groupsByType[type] = cellGroups.filter(g => g.type === type).length;
    }
    
    // グループサイズの分布
    const sizeDistribution = {
        small: cellGroups.filter(g => g.cells.length < 4).length,
        medium: cellGroups.filter(g => g.cells.length >= 4 && g.cells.length < 8).length,
        large: cellGroups.filter(g => g.cells.length >= 8).length
    };
    
    simulationStats.groupStats.push({
        turn: turn,
        totalGroups: cellGroups.length,
        byType: { ...groupsByType },
        sizeDistribution: { ...sizeDistribution },
        season: currentSeason
    });
}

// グラフ描画用の関数（デバッグUIで使用）
function drawPopulationGraph() {
    if (simulationStats.populationStats.length < 2) {
        return "データが不足しています";
    }
    
    // データの準備
    const labels = simulationStats.populationStats.map(stat => stat.turn);
    const datasets = [];
    
    // 型ごとのデータセット作成
    for (const type of CELL_TYPES) {
        datasets.push({
            label: type,
            data: simulationStats.populationStats.map(stat => stat.byType[type]),
            borderColor: CELL_COLORS[type],
            backgroundColor: 'rgba(0, 0, 0, 0.1)',
            tension: 0.4
        });
    }
    
    // ウイルスとコープスのデータも追加
    datasets.push({
        label: 'Viruses',
        data: simulationStats.populationStats.map(stat => stat.virusCount),
        borderColor: '#9370DB', // ウイルスの色
        backgroundColor: 'rgba(0, 0, 0, 0.1)',
        tension: 0.4,
        borderDash: [5, 5]
    });
    
    datasets.push({
        label: 'Corpses',
        data: simulationStats.populationStats.map(stat => stat.corpseCount),
        borderColor: '#555555', // 死骸の色
        backgroundColor: 'rgba(0, 0, 0, 0.1)',
        tension: 0.4,
        borderDash: [2, 2]
    });
    
    // グラフ設定
    const config = {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            plugins: {
                legend: { position: 'top' },
                title: { display: true, text: '細胞数の変化' }
            },
            scales: {
                y: { beginAtZero: true }
            }
        }
    };
    
    return config;
}

// グループ統計グラフの描画
function drawGroupsGraph() {
    if (simulationStats.groupStats.length < 2) {
        return "データが不足しています";
    }
    
    // データの準備
    const labels = simulationStats.groupStats.map(stat => stat.turn);
    const datasets = [];
    
    // 型ごとのグループ数
    for (const type of CELL_TYPES) {
        datasets.push({
            label: `${type} グループ`,
            data: simulationStats.groupStats.map(stat => stat.byType[type]),
            borderColor: CELL_COLORS[type],
            backgroundColor: 'rgba(0, 0, 0, 0.1)',
            tension: 0.4
        });
    }
    
    // サイズ分布
    datasets.push({
        label: '小グループ (1-3)',
        data: simulationStats.groupStats.map(stat => stat.sizeDistribution.small),
        borderColor: '#AAAAAA',
        backgroundColor: 'rgba(0, 0, 0, 0.1)',
        tension: 0.4,
        borderDash: [5, 5]
    });
    
    datasets.push({
        label: '中グループ (4-7)',
        data: simulationStats.groupStats.map(stat => stat.sizeDistribution.medium),
        borderColor: '#777777',
        backgroundColor: 'rgba(0, 0, 0, 0.1)',
        tension: 0.4,
        borderDash: [3, 3]
    });
    
    datasets.push({
        label: '大グループ (8+)',
        data: simulationStats.groupStats.map(stat => stat.sizeDistribution.large),
        borderColor: '#444444',
        backgroundColor: 'rgba(0, 0, 0, 0.1)',
        tension: 0.4,
        borderDash: [2, 2]
    });
    
    // グラフ設定
    const config = {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            plugins: {
                legend: { position: 'top' },
                title: { display: true, text: 'グループ数の変化' }
            },
            scales: {
                y: { beginAtZero: true }
            }
        }
    };
    
    return config;
}

// 統計データを利用した分析表示
function displaySimulationAnalysis() {
    if (simulationStats.populationStats.length < 5) {
        console.log("分析には十分なデータがありません");
        return;
    }
    
    console.log("=== シミュレーション分析 ===");
    
    // 直近のデータ
    const recent = simulationStats.populationStats.slice(-5);
    
    // 個体数トレンド
    const populationTrend = {};
    for (const type of CELL_TYPES) {
        const earliest = recent[0].byType[type];
        const latest = recent[recent.length - 1].byType[type];
        const change = latest - earliest;
        const percentChange = earliest > 0 ? (change / earliest) * 100 : 0;
        
        populationTrend[type] = {
            current: latest,
            change: change,
            percentChange: percentChange
        };
    }
    
    console.log("個体数トレンド:");
    for (const type in populationTrend) {
        const trend = populationTrend[type];
        console.log(`- ${type}: ${trend.current}個体 (${trend.change >= 0 ? '+' : ''}${trend.change}, ${trend.percentChange.toFixed(1)}%)`);
    }
    
    // グループ数トレンド
    if (simulationStats.groupStats.length >= 5) {
        const recentGroups = simulationStats.groupStats.slice(-5);
        
        const groupTrend = {};
        for (const type of CELL_TYPES) {
            const earliest = recentGroups[0].byType[type];
            const latest = recentGroups[recentGroups.length - 1].byType[type];
            const change = latest - earliest;
            const percentChange = earliest > 0 ? (change / earliest) * 100 : 0;
            
            groupTrend[type] = {
                current: latest,
                change: change,
                percentChange: percentChange
            };
        }
        
        console.log("\nグループ数トレンド:");
        for (const type in groupTrend) {
            const trend = groupTrend[type];
            console.log(`- ${type}: ${trend.current}グループ (${trend.change >= 0 ? '+' : ''}${trend.change}, ${trend.percentChange.toFixed(1)}%)`);
        }
    }
    
    // 季節の影響分析
    const seasonalImpact = {};
    for (const type of CELL_TYPES) {
        seasonalImpact[type] = {
            wood: 0, fire: 0, earth: 0, metal: 0, water: 0
        };
    }
    
    // 季節ごとの平均個体数を算出
    for (let i = 0; i < simulationStats.populationStats.length; i++) {
        const stat = simulationStats.populationStats[i];
        const groupStat = i < simulationStats.groupStats.length ? simulationStats.groupStats[i] : null;
        
        if (groupStat) {
            const season = groupStat.season;
            
            for (const type of CELL_TYPES) {
                seasonalImpact[type][season] += stat.byType[type];
            }
        }
    }
    
    // 各季節のカウント
    const seasonCounts = { wood: 0, fire: 0, earth: 0, metal: 0, water: 0 };
    for (const stat of simulationStats.groupStats) {
        seasonCounts[stat.season]++;
    }
    
    // 平均に変換
    for (const type in seasonalImpact) {
        for (const season in seasonalImpact[type]) {
            if (seasonCounts[season] > 0) {
                seasonalImpact[type][season] /= seasonCounts[season];
            }
        }
    }
    
    console.log("\n季節の影響分析:");
    for (const type in seasonalImpact) {
        console.log(`${type}型の季節ごとの平均個体数:`);
        for (const season in seasonalImpact[type]) {
            // 特に影響が大きい季節を強調
            let impact = '';
            if (season === type) {
                impact = ' (自己強化)';
            } else if (getOverridingElement(season) === type) {
                impact = ' (抑制される)';
            } else if (getGeneratedElement(season) === type) {
                impact = ' (生成される)';
            }
            
            console.log(`  - ${ELEMENT_SEASONS[season]}: ${seasonalImpact[type][season].toFixed(1)}個体${impact}`);
        }
    }
    
    console.log("=============================");
}

// デバッグ用の拡張UI機能
function createDebugUI() {
    // デバッグUIの表示状態
    let isDebugUIVisible = false;
    
    // デバッグボタンの追加
    const debugButton = document.createElement('button');
    debugButton.textContent = '🔍 デバッグ';
    debugButton.style.position = 'absolute';
    debugButton.style.top = '10px';
    debugButton.style.right = '10px';
    debugButton.style.zIndex = '1000';
    document.body.appendChild(debugButton);
    
    // デバッグUIの作成
    const debugPanel = document.createElement('div');
    debugPanel.style.position = 'absolute';
    debugPanel.style.top = '50px';
    debugPanel.style.right = '10px';
    debugPanel.style.width = '300px';
    debugPanel.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
    debugPanel.style.color = '#FFF';
    debugPanel.style.padding = '10px';
    debugPanel.style.borderRadius = '5px';
    debugPanel.style.zIndex = '999';
    debugPanel.style.display = 'none';
    debugPanel.style.maxHeight = '80vh';
    debugPanel.style.overflowY = 'auto';
    document.body.appendChild(debugPanel);
    
    // デバッグUIの内容
    debugPanel.innerHTML = `
        <h3>デバッグパネル</h3>
        <div>
            <button id="debugDisplayStats">統計表示</button>
            <button id="debugTriggerEvent">イベント発生</button>
        </div>
        <div>
            <button id="debugAnalyzeGroups">グループ分析</button>
            <button id="debugShowMemories">社会的記憶</button>
        </div>
        <hr>
        <div id="debugContent" style="margin-top: 10px;"></div>
    `;
    
    // デバッグUIの表示/非表示切り替え
    debugButton.addEventListener('click', () => {
        isDebugUIVisible = !isDebugUIVisible;
        debugPanel.style.display = isDebugUIVisible ? 'block' : 'none';
    });
    
    // 統計表示ボタン
    document.getElementById('debugDisplayStats').addEventListener('click', () => {
        // 統計データの記録
        recordSimulationStats();
        
        // 分析の表示
        displaySimulationAnalysis();
        
        // デバッグパネルにも表示
        const content = document.getElementById('debugContent');
        content.innerHTML = `
            <h4>シミュレーション統計</h4>
            <p>ターン数: ${turn}</p>
            <p>細胞数: ${cells.length}</p>
            <p>グループ数: ${cellGroups.length}</p>
            <p>現在の季節: ${ELEMENT_SEASONS[currentSeason]}</p>
            <p>災害状態: ${disasterActive ? '発生中' : '非発生'}</p>
        `;
    });
    
    // イベント発生ボタン
    document.getElementById('debugTriggerEvent').addEventListener('click', () => {
        const content = document.getElementById('debugContent');
        content.innerHTML = `
            <h4>イベント発生</h4>
            <button id="triggerRevolution">社会革命</button>
            <button id="triggerCompetition">集団競争</button>
            <button id="triggerSeasonalEvent">季節イベント</button>
            <button id="triggerDisaster">災害</button>
        `;
        
        document.getElementById('triggerRevolution').addEventListener('click', () => {
            triggerSocialRevolution();
            content.innerHTML += '<p>社会革命が発生しました!</p>';
        });
        
        document.getElementById('triggerCompetition').addEventListener('click', () => {
            triggerGroupCompetition();
            content.innerHTML += '<p>集団競争が発生しました!</p>';
        });
        
        document.getElementById('triggerSeasonalEvent').addEventListener('click', () => {
            triggerSeasonalEvent();
            content.innerHTML += `<p>${ELEMENT_SEASONS[currentSeason]}のイベントが発生しました!</p>`;
        });
        
        document.getElementById('triggerDisaster').addEventListener('click', () => {
            startDisaster();
            content.innerHTML += '<p>災害が発生しました!</p>';
        });
    });
    
    // グループ分析ボタン
    document.getElementById('debugAnalyzeGroups').addEventListener('click', () => {
        const content = document.getElementById('debugContent');
        
        if (cellGroups.length === 0) {
            content.innerHTML = '<p>分析するグループがありません</p>';
            return;
        }
        
        content.innerHTML = `
            <h4>グループ分析</h4>
            <p>グループ数: ${cellGroups.length}</p>
            <div id="groupList"></div>
        `;
        
        const groupList = document.getElementById('groupList');
        
        // グループのリスト表示
        for (let i = 0; i < cellGroups.length; i++) {
            const group = cellGroups[i];
            const groupItem = document.createElement('div');
            groupItem.style.marginTop = '5px';
            groupItem.style.padding = '5px';
            groupItem.style.border = `1px solid ${CELL_COLORS[group.type]}`;
            groupItem.style.borderRadius = '3px';
            
            groupItem.innerHTML = `
                <strong>${group.type}グループ</strong> (${group.cells.length}メンバー)
                <br>安定性: ${group.stability.toFixed(2)}
                <br>目標進行: ${group.goalProgress.toFixed(2)}
                <button class="analyzeGroupBtn" data-index="${i}">詳細分析</button>
            `;
            
            groupList.appendChild(groupItem);
        }
        
        // 詳細分析ボタンのイベントリスナー
        const analyzeButtons = document.getElementsByClassName('analyzeGroupBtn');
        for (let i = 0; i < analyzeButtons.length; i++) {
            analyzeButtons[i].addEventListener('click', (e) => {
                const groupIndex = e.target.getAttribute('data-index');
                analyzeGroupRoles(cellGroups[groupIndex]);
                
                // 分析結果を表示
                content.innerHTML += `<div style="margin-top: 10px; border-top: 1px solid #444; padding-top: 5px;">
                    <p>グループ${groupIndex}の詳細分析が完了しました。コンソールを確認してください。</p>
                </div>`;
            });
        }
    });
    
    // 社会的記憶ボタン
    document.getElementById('debugShowMemories').addEventListener('click', () => {
        const content = document.getElementById('debugContent');
        
        if (cells.length === 0) {
            content.innerHTML = '<p>分析する細胞がありません</p>';
            return;
        }
        
        content.innerHTML = `
            <h4>社会的記憶分析</h4>
            <p>ランダムな細胞10個の社会的記憶を表示します</p>
            <div id="memoryList"></div>
        `;
        
        const memoryList = document.getElementById('memoryList');
        
        // ランダムに最大10個の細胞を選択
        const sampleSize = Math.min(10, cells.length);
        const samples = [];
        for (let i = 0; i < sampleSize; i++) {
            let cell;
            do {
                cell = cells[Math.floor(Math.random() * cells.length)];
            } while (samples.includes(cell));
            samples.push(cell);
        }
        
        // 各細胞の情報表示
        for (let i = 0; i < samples.length; i++) {
            const cell = samples[i];
            const cellItem = document.createElement('div');
            cellItem.style.marginTop = '5px';
            cellItem.style.padding = '5px';
            cellItem.style.border = `1px solid ${CELL_COLORS[cell.type]}`;
            cellItem.style.borderRadius = '3px';
            
            const memoryCount = cell.socialMemory ? cell.socialMemory.length : 0;
            const groupStatus = cell.group ? 
                `${cell.group.type}グループのメンバー${cell.isLeader ? ' (リーダー)' : ''}` : 
                'グループなし';
            
            cellItem.innerHTML = `
                <strong>${cell.type}細胞</strong>
                <br>記憶数: ${memoryCount}
                <br>グループ: ${groupStatus}
                <button class="showMemoryBtn" data-index="${i}">記憶表示</button>
            `;
            
            memoryList.appendChild(cellItem);
        }
        
        // 記憶表示ボタンのイベントリスナー
        const memoryButtons = document.getElementsByClassName('showMemoryBtn');
        for (let i = 0; i < memoryButtons.length; i++) {
            memoryButtons[i].addEventListener('click', (e) => {
                const cellIndex = e.target.getAttribute('data-index');
                visualizeCellSocialMemory(samples[cellIndex]);
                
                // 分析結果を表示
                content.innerHTML += `<div style="margin-top: 10px; border-top: 1px solid #444; padding-top: 5px;">
                    <p>細胞の社会的記憶が表示されました。コンソールを確認してください。</p>
                </div>`;
            });
        }
    });
}

// 初期化時にデバッグUIを追加
window.addEventListener('load', () => {
    init();
    draw();
    
    // デバッグUI追加（オプション）
    if (DEBUG_MODE) {
        createDebugUI();
    }
});

// シミュレーションの統計記録をupdate関数に組み込む
let statsRecordCounter = 0;
const STATS_RECORD_INTERVAL = 50; // 50ターンごとに記録

// update関数の一部として追加
function updateWithStats() {
    // 既存のupdate処理...
    update();
    
    // 統計記録
    statsRecordCounter++;
    if (statsRecordCounter >= STATS_RECORD_INTERVAL) {
        recordSimulationStats();
        statsRecordCounter = 0;
    }
}

// HTMLインターフェースの拡張 - 社会性設定パネル
function createSocialControlPanel() {
    const socialControlPanel = document.createElement('div');
    socialControlPanel.className = 'control-group';
    socialControlPanel.innerHTML = `
        <h3>社会性設定</h3>
        <div class="control-item">
            <label for="groupFormationRate">集団形成率:</label>
            <input type="range" id="groupFormationRate" min="0" max="100" value="50">
            <span id="groupFormationRateValue">50%</span>
        </div>
        <div class="control-item">
            <label for="leadershipInfluence">リーダーシップ影響:</label>
            <input type="range" id="leadershipInfluence" min="0" max="100" value="70">
            <span id="leadershipInfluenceValue">70%</span>
        </div>
        <div class="control-item">
            <label for="socialMemoryStrength">社会的記憶強度:</label>
            <input type="range" id="socialMemoryStrength" min="0" max="100" value="60">
            <span id="socialMemoryStrengthValue">60%</span>
        </div>
        <div class="control-item">
            <label for="elementalInteractionStrength">五行相互作用強度:</label>
            <input type="range" id="elementalInteractionStrength" min="0" max="100" value="80">
            <span id="elementalInteractionStrengthValue">80%</span>
        </div>
        <div class="control-action">
            <button id="triggerSocialEventBtn">社会イベント誘発</button>
        </div>
    `;
    
    // コントロールパネルに追加
    controlsPanel.appendChild(socialControlPanel);
    
    // スライダーのイベントリスナー設定
    const groupFormationRateSlider = document.getElementById('groupFormationRate');
    const groupFormationRateValue = document.getElementById('groupFormationRateValue');
    groupFormationRateSlider.addEventListener('input', () => {
        const value = groupFormationRateSlider.value;
        groupFormationRateValue.textContent = `${value}%`;
        GLOBAL_GROUP_FORMATION_RATE = value / 100;
    });
    
    const leadershipInfluenceSlider = document.getElementById('leadershipInfluence');
    const leadershipInfluenceValue = document.getElementById('leadershipInfluenceValue');
    leadershipInfluenceSlider.addEventListener('input', () => {
        const value = leadershipInfluenceSlider.value;
        leadershipInfluenceValue.textContent = `${value}%`;
        GLOBAL_LEADERSHIP_INFLUENCE = value / 100;
    });
    
    const socialMemoryStrengthSlider = document.getElementById('socialMemoryStrength');
    const socialMemoryStrengthValue = document.getElementById('socialMemoryStrengthValue');
    socialMemoryStrengthSlider.addEventListener('input', () => {
        const value = socialMemoryStrengthSlider.value;
        socialMemoryStrengthValue.textContent = `${value}%`;
        GLOBAL_SOCIAL_MEMORY_STRENGTH = value / 100;
    });
    
    const elementalInteractionStrengthSlider = document.getElementById('elementalInteractionStrength');
    const elementalInteractionStrengthValue = document.getElementById('elementalInteractionStrengthValue');
    elementalInteractionStrengthSlider.addEventListener('input', () => {
        const value = elementalInteractionStrengthSlider.value;
        elementalInteractionStrengthValue.textContent = `${value}%`;
        GLOBAL_ELEMENTAL_INTERACTION_STRENGTH = value / 100;
    });
    
    // 社会イベントボタン
    document.getElementById('triggerSocialEventBtn').addEventListener('click', () => {
        // ランダムな社会イベントを発生
        const eventType = Math.floor(Math.random() * 3);
        
        switch (eventType) {
            case 0:
                triggerSocialRevolution();
                break;
            case 1:
                triggerGroupCompetition();
                break;
            case 2:
                triggerSeasonalEvent();
                break;
        }
    });
}

// 初期化関数の拡張
let GLOBAL_GROUP_FORMATION_RATE = 0.5;
let GLOBAL_LEADERSHIP_INFLUENCE = 0.7;
let GLOBAL_SOCIAL_MEMORY_STRENGTH = 0.6;
let GLOBAL_ELEMENTAL_INTERACTION_STRENGTH = 0.8;

function initEnhanced() {
    // 既存の初期化処理
    init();
    
    // 社会性コントロールパネルの追加
    createSocialControlPanel();
    
    // 統計データのリセット
    simulationStats = {
        turnRecords: [],
        groupStats: [],
        populationStats: [],
        eventLog: []
    };
    
    statsRecordCounter = 0;
    
    // グローバル設定の初期化
    GLOBAL_GROUP_FORMATION_RATE = 0.5;
    GLOBAL_LEADERSHIP_INFLUENCE = 0.7;
    GLOBAL_SOCIAL_MEMORY_STRENGTH = 0.6;
    GLOBAL_ELEMENTAL_INTERACTION_STRENGTH = 0.8;
}

// 既存のリセットボタンのイベントリスナー変更
resetButton.addEventListener('click', () => {
    pauseGame();
    initEnhanced();
    draw();
});

// インターフェースの最終初期化
window.addEventListener('load', () => {
    initEnhanced();
    draw();
    
    // オプションのデバッグUI
    if (DEBUG_MODE) {
        createDebugUI();
    }
});

// この実装は既存の Five Elements Life Game に社会的行動機能を追加するものです。
// 既存のコードとシームレスに統合するために、上記の関数を適切な場所に配置し、
// グローバル変数を宣言し、イベントリスナーを設定してください。
// 特に update 関数と init 関数の拡張は、既存の同名関数を置き換えるのではなく、
// 元の実装に新しい機能を追加するようにしてください。