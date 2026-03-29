import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

class SeaExplorer {
    constructor() {
        this.container = document.getElementById('container');
        this.inspectContainer = document.getElementById('inspect-container');
        
        // Main Scene
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.orbitControls = null;
        this.pointerLockControls = null;
        
        // Inspect Scene
        this.inspectScene = null;
        this.inspectCamera = null;
        this.inspectControls = null;
        this.inspectModel = null;
        this.inspectMixer = null;
        
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        
        this.isFreeSwim = true;
        this.isInspecting = false;
        
        this.moveForward = false;
        this.moveBackward = false;
        this.moveLeft = false;
        this.moveRight = false;
        this.moveUp = false;
        this.moveDown = false;
        
        this.velocity = new THREE.Vector3();
        this.direction = new THREE.Vector3();
        this.clock = new THREE.Clock();
        
        // --- Inspect Mode Interaction variables ---
        this.isDragging = false;
        this.previousMousePosition = { x: 0, y: 0 };
        this.currentRotation = { x: 0, y: 0 };
        this.targetRotation = { x: 0, y: 0 };
        this.rotationVelocity = { x: 0, y: 0 };
        this.inspectZoom = 10;
        this.targetInspectZoom = 10;
        
        this.texLoader = new THREE.TextureLoader();
        
        this.models = [];
        this.mixers = [];
        this.originalCameraPos = new THREE.Vector3(0, 150, 600);
        this.bubbles = null;
        
        // Physics/Movement constants
        this.DRAG = 0.95;
        this.ACCEL = 400.0;
        
        this.init();
    }

    async init() {
        // --- MAIN SCENE SETUP ---
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0xa3d8f4);
        this.scene.fog = new THREE.FogExp2(0xa3d8f4, 0.001);

        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1.0, 20000);
        this.camera.position.copy(this.originalCameraPos);
        this.camera.lookAt(0, -100, 0);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.0; // Reduced from 1.6 for more natural lighting
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.container.appendChild(this.renderer.domElement);

        // --- INSPECT SCENE SETUP ---
        this.setupInspectScene();

        // --- COMMON SETUP ---
        this.setupLighting();
        this.setupControls();
        this.setupEnvironment();
        await this.loadModels();
        this.setupUIEvents();

        window.addEventListener('resize', () => this.onWindowResize());
        this.animate();

        const loadingScreen = document.getElementById('loading-screen');
        loadingScreen.style.opacity = '0';
        setTimeout(() => loadingScreen.style.display = 'none', 1000);
    }

    setupInspectScene() {
        // --- 1. CLEAN SLATE SETUP ---
        this.inspectScene = new THREE.Scene();
        // A softer Sky Blue for better contrast
        const skyBlue = new THREE.Color(0xa3d8f4); 
        this.inspectScene.background = skyBlue;
        this.inspectScene.fog = new THREE.FogExp2(0xa3d8f4, 0.008);

        this.inspectCamera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.inspectCamera.position.set(0, 0, 30); 

        // --- 2. BALANCED STUDIO LIGHTING ---
        // Subtle blue-tinted lights for "real sea" color depth
        const ambient = new THREE.AmbientLight(0xddeeff, 0.8); 
        this.inspectScene.add(ambient);

        const hemi = new THREE.HemisphereLight(0xffffff, 0x004488, 0.6); 
        this.inspectScene.add(hemi);

        // Key light (Main illumination)
        const sun = new THREE.DirectionalLight(0xffffff, 1.4); 
        sun.position.set(20, 30, 45);
        sun.castShadow = true;
        this.inspectScene.add(sun);

        // Fill light (Softens shadows)
        const fill = new THREE.DirectionalLight(0x88ccff, 1.0);
        fill.position.set(-30, 15, 25);
        this.inspectScene.add(fill);

        // Rim light (Back highlights)
        const rim = new THREE.DirectionalLight(0xaaddff, 1.2); 
        rim.position.set(0, 10, -50);
        this.inspectScene.add(rim);

        // Headlight (Follows camera)
        this.inspectHeadlight = new THREE.PointLight(0xffffff, 0.8, 200); 
        this.inspectScene.add(this.inspectHeadlight);

        // --- 3. FLOATING PARTICLES (Marine Snow) ---
        const particleCount = 500;
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(particleCount * 3);
        for (let i = 0; i < particleCount * 3; i++) {
            positions[i] = (Math.random() - 0.5) * 100;
        }
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const material = new THREE.PointsMaterial({
            color: 0xffffff,
            size: 0.1,
            transparent: true,
            opacity: 0.4, // Lowered opacity to avoid clutter
            blending: THREE.AdditiveBlending
        });
        this.inspectParticles = new THREE.Points(geometry, material);
        this.inspectScene.add(this.inspectParticles);

        // --- 4. GROUND BASE (SEA FLOOR) ---
        const texLoader = this.texLoader;
        const sandTexture = texLoader.load('https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/terrain/grasslight-big.jpg'); 
        sandTexture.wrapS = sandTexture.wrapT = THREE.RepeatWrapping;
        sandTexture.repeat.set(10, 10);

        const floorGeo = new THREE.CircleGeometry(50, 64);
        const floorMat = new THREE.MeshStandardMaterial({
            color: 0xfff4d1,
            map: sandTexture,
            roughness: 0.8,
            metalness: 0.1,
            transparent: true,
            opacity: 0.7 // More transparent to blend with background
        });

        this.inspectFloor = new THREE.Mesh(floorGeo, floorMat);
        this.inspectFloor.rotation.x = -Math.PI / 2;
        this.inspectFloor.position.y = -10; // Position below the model
        this.inspectFloor.receiveShadow = true;
        this.inspectScene.add(this.inspectFloor);

        // --- 5. ENVIRONMENT MAP (CRITICAL FOR PBR TEXTURES) ---
        // A very bright studio for the environment map
        const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
        const envScene = new THREE.Scene();
        envScene.add(new THREE.AmbientLight(0xffffff, 10)); // Boosted ambient
        const envLight1 = new THREE.PointLight(0xffffff, 100);
        envLight1.position.set(10, 10, 10);
        envScene.add(envLight1);
        const envLight2 = new THREE.PointLight(0xffffff, 100);
        envLight2.position.set(-10, -10, -10);
        envScene.add(envLight2);
        this.inspectScene.environment = pmremGenerator.fromScene(envScene).texture;

        // --- 6. PROFESSIONAL ORBIT CONTROLS ---
        this.inspectControls = new OrbitControls(this.inspectCamera, this.renderer.domElement);
        this.inspectControls.enableDamping = true;
        this.inspectControls.dampingFactor = 0.05;
        this.inspectControls.enablePan = false;
        this.inspectControls.autoRotate = true;
        this.inspectControls.autoRotateSpeed = 1.0;
        this.inspectControls.minDistance = 5;
        this.inspectControls.maxDistance = 100;
        this.inspectControls.target.set(0, 0, 0); 
        this.inspectControls.enabled = false;
    }

    setupLighting() {
        const ambientLight = new THREE.AmbientLight(0xa3d8f4, 1.4); 
        this.scene.add(ambientLight);

        const sunLight = new THREE.DirectionalLight(0xffffff, 1.8);
        sunLight.position.set(50, 500, 50);
        sunLight.castShadow = true;
        sunLight.shadow.mapSize.set(2048, 2048);
        this.scene.add(sunLight);

        const hemiLight = new THREE.HemisphereLight(0xa3d8f4, 0xfff4d1, 1.0); 
        this.scene.add(hemiLight);
    }

    setupControls() {
        // Orbit Controls (for inspection)
        this.orbitControls = new OrbitControls(this.camera, this.renderer.domElement);
        this.orbitControls.enableDamping = true;
        this.orbitControls.dampingFactor = 0.05;
        this.orbitControls.enabled = false;

        // Pointer Lock Controls (for free swim)
        this.pointerLockControls = new PointerLockControls(this.camera, document.body);
        
        const onKeyDown = (event) => {
            if (!this.isFreeSwim) return;
            switch (event.code) {
                case 'KeyW': this.moveForward = true; break;
                case 'KeyA': this.moveLeft = true; break;
                case 'KeyS': this.moveBackward = true; break;
                case 'KeyD': this.moveRight = true; break;
                case 'KeyQ': this.moveUp = true; break;
                case 'KeyE': this.moveDown = true; break;
            }
        };

        const onKeyUp = (event) => {
            switch (event.code) {
                case 'KeyW': this.moveForward = false; break;
                case 'KeyA': this.moveLeft = false; break;
                case 'KeyS': this.moveBackward = false; break;
                case 'KeyD': this.moveRight = false; break;
                case 'KeyQ': this.moveUp = false; break;
                case 'KeyE': this.moveDown = false; break;
            }
        };

        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('keyup', onKeyUp);
        
        // Click to lock mouse in free swim
        this.container.addEventListener('click', () => {
            if (this.isFreeSwim && !this.selectedAnimal) {
                this.pointerLockControls.lock();
            }
        });

        // IMMERSIVE INSPECT INTERACTION
        window.addEventListener('mousedown', (e) => {
            if (!this.isInspecting) {
                // Main sea scene click detection
                this.onMouseClick(e);
                return;
            }
        });

        window.addEventListener('wheel', (e) => {
            if (!this.isInspecting) return;
            // OrbitControls already handles zoom, but we can fine-tune if needed
        });
    }

    setupEnvironment() {
        const texLoader = new THREE.TextureLoader();
        
        // Vast Bright Sand Floor (Brighter and larger)
        const sandTexture = texLoader.load('https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/terrain/grasslight-big.jpg'); 
        sandTexture.wrapS = sandTexture.wrapT = THREE.RepeatWrapping;
        sandTexture.repeat.set(100, 100);

        const floorGeo = new THREE.PlaneGeometry(20000, 20000, 32, 32);
        const floorMat = new THREE.MeshStandardMaterial({
            color: 0xfff4d1, // Brighter Yellowish-Beige Sand (from image)
            map: sandTexture,
            roughness: 1.0,
            metalness: 0.0
        });

        const floor = new THREE.Mesh(floorGeo, floorMat);
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = -100; // Raised floor position for visibility
        floor.receiveShadow = true;
        this.scene.add(floor);

        // Very Subtle Bubbles
        const bubbleGeo = new THREE.SphereGeometry(0.5, 8, 8);
        const bubbleMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.05 });
        this.bubbles = new THREE.Group();
        for (let i = 0; i < 200; i++) {
            const bubble = new THREE.Mesh(bubbleGeo, bubbleMat);
            bubble.position.set(
                (Math.random() - 0.5) * 5000,
                (Math.random() - 0.5) * 1000,
                (Math.random() - 0.5) * 5000
            );
            bubble.userData.speed = Math.random() * 0.2 + 0.1;
            this.bubbles.add(bubble);
        }
        this.scene.add(this.bubbles);
    }

    async loadModels() {
        const loader = new GLTFLoader();
        const animalConfigs = [
            { 
                name: 'Gourami', 
                path: 'models/gourami/ccb4cf930c2342ffbe63a09e81d667ad_Textured.gltf', 
                type: 'small', 
                pos: new THREE.Vector3(-400, -20, 200),
                fact: 'Gouramis are vibrant tropical fish with unique labyrinth organs.'
            },
            { 
                name: 'Jellyfish', 
                path: 'models/jellyfish/679b5ec2efb8401f97ee7dd5ac54fa29_Textured.gltf', 
                type: 'medium', 
                pos: new THREE.Vector3(200, 50, -300),
                fact: 'Jellyfish are mesmerizing ancient creatures of the deep blue.'
            },
            { 
                name: 'Sea Creature', 
                path: 'models/unknown/211f0b2dd3f349e1ab33ed9addf89e82.gltf', 
                type: 'medium', 
                pos: new THREE.Vector3(-100, -80, -100),
                fact: 'A beautiful and mysterious organism thriving on the ocean floor.'
            },
            { 
                name: 'Humpback Whale', 
                path: 'models/whale/2a72200995344602a4daab15e8872766_Textured.gltf', 
                type: 'large', 
                pos: new THREE.Vector3(800, 150, 600),
                fact: 'The Humpback Whale is a giant of the sea, known for its haunting songs.'
            },
            { 
                name: 'Great White Shark', 
                path: 'models/shark/50a97b0669ac4884a156838cd9ad06e5_Textured.gltf', 
                type: 'large', 
                pos: new THREE.Vector3(-600, 50, -500),
                fact: 'The Great White Shark is one of the ocean\'s most formidable predators.'
            },
            { 
                name: 'Sea Green Turtle', 
                path: 'models/turtle/0530386d3fef4157b10dbbdb4688e758_Textured.gltf', 
                type: 'medium', 
                pos: new THREE.Vector3(400, -40, -500),
                fact: 'Sea turtles are gentle marine reptiles that travel thousands of miles across oceans.'
            },
            { 
                name: 'Starfish', 
                path: 'models/starfish/ab733098dac54b17acdc663e1d341a2a_Textured.gltf', 
                type: 'small', 
                pos: new THREE.Vector3(0, -95, 0), // Positioned on the sea floor
                fact: 'Starfish are not actually fish; they are echinoderms related to sea urchins.'
            },
            { 
                name: 'Oarfish', 
                path: 'models/oarfish/12a7a91318614fa69bb5e12710f585d9_Textured.gltf', 
                type: 'large', 
                pos: new THREE.Vector3(-1000, 200, -800),
                rotation: new THREE.Euler(Math.PI, Math.PI, 0), // Fix upside down and mirror issue
                fact: 'The Oarfish is the longest bony fish in the world, often mistaken for a sea serpent.'
            },
            { 
                name: 'Bottlenose Dolphin', 
                path: 'models/dolphin/d165e4ce842d408e99133f77f1fc37fb_Textured.gltf', 
                type: 'medium', 
                pos: new THREE.Vector3(500, 100, 300),
                fact: 'Bottlenose Dolphins are highly intelligent and social marine mammals.'
            },
            { 
                name: 'Clownfish', 
                path: 'models/clownfish/80365cf8644744ff8f8fddc24670e073_Textured.gltf', 
                type: 'small', 
                pos: new THREE.Vector3(-200, -50, 400),
                fact: 'Clownfish have a symbiotic relationship with sea anemones.'
            },
            { 
                name: 'Stingray', 
                path: 'models/stingray/6babc34772b840348e7c7db56b430863_Textured.gltf', 
                type: 'medium', 
                pos: new THREE.Vector3(100, -90, 500),
                fact: 'Stingrays are flat-bodied fish that often bury themselves in the sand.'
            }
        ];

        const progressBar = document.getElementById('progress-bar');
        const texLoader = new THREE.TextureLoader();
        texLoader.colorSpace = THREE.SRGBColorSpace;

        for (let i = 0; i < animalConfigs.length; i++) {
            const config = animalConfigs[i];
            await new Promise(resolve => {
                loader.load(config.path, (gltf) => {
                    const model = gltf.scene;
                    
                    // Force geometry centering
                    const box = new THREE.Box3().setFromObject(model);
                    const center = box.getCenter(new THREE.Vector3());
                    model.position.sub(center);

                    const wrapper = new THREE.Group();
                    wrapper.add(model);

                    const size = box.getSize(new THREE.Vector3());
                    const maxDim = Math.max(size.x, size.y, size.z);
                    
                    let s = 1.0;
                    if (config.type === 'small') s = 25.0 / maxDim;
                    if (config.type === 'medium') s = 120.0 / maxDim;
                    if (config.type === 'large') s = 600.0 / maxDim;
                    
                    wrapper.scale.setScalar(s);
                    wrapper.position.copy(config.pos);
                    
                    // Apply custom rotation if specified in config
                    if (config.rotation) {
                        model.rotation.copy(config.rotation);
                    }
                    
                    // ADVANCED TEXTURING & VISIBILITY
                    wrapper.traverse(child => {
                        if (child.isMesh) {
                            child.castShadow = true;
                            child.receiveShadow = true;

                            // --- SET EYES TO DARK BLACK (REALISM) ---
                            const lowerName = child.name.toLowerCase();
                            if (lowerName.includes('eye') || lowerName.includes('pupil') || lowerName.includes('iris') || lowerName.includes('cornea')) {
                                if (child.material) {
                                    child.material = new THREE.MeshStandardMaterial({
                                        color: 0x010101, // Even deeper pure black
                                        roughness: 0.05, // Extremely glossy
                                        metalness: 0.2,
                                        envMapIntensity: 1.0
                                    });
                                }
                                return;
                            }

                            // Skip custom texturing for teeth to maintain original color
                            if (lowerName.includes('teeth') || lowerName.includes('tooth')) {
                                if (child.material) {
                                    child.material = child.material.clone();
                                    child.material.envMapIntensity = 0.5; // Very low reflection for teeth to look solid
                                }
                                return;
                            }

                            // --- APPLY VIBRANT BLOOD RED TO INTERNAL PARTS (REALISM) ---
                            // Broadened search for mouth/internal parts
                            const internalKeywords = ['mouth', 'throat', 'inner', 'tongue', 'gills', 'stomach', 'flesh', 'oral', 'cavity', 'interior', 'gum'];
                            if (internalKeywords.some(kw => lowerName.includes(kw))) {
                                child.material = new THREE.MeshStandardMaterial({
                                    color: 0xcc0000, // More vibrant and obvious "Blood Red"
                                    roughness: 0.2,  // Slightly wet
                                    metalness: 0.0,
                                    envMapIntensity: 0.0, // Zero reflection to keep the color pure red
                                    side: THREE.DoubleSide
                                });
                                return;
                            }

                            // Apply specific HD textures based on model name
                            if (config.name === 'Humpback Whale') {
                                child.material = new THREE.MeshStandardMaterial({
                                    map: this.loadTexture('models/whale/517e977d58914f18b1edd559053aa6c3_RGB_BARBS_BaseColor.png'),
                                    normalMap: texLoader.load('models/whale/de9c4c2c440c413cbedbc604a0f5fe1a_N_BARBSl_Normal.png'),
                                    roughnessMap: texLoader.load('models/whale/3b4cc1debebd41baa0532e97d97ac95b_R_BARBS_Roughness.png'),
                                    aoMap: texLoader.load('models/whale/2d54593132d147efa3d80da737484db1_R_Humpback_AOMap.png'),
                                    roughness: 1.0,
                                    metalness: 0.1,
                                    envMapIntensity: 2.0,
                                    transparent: false,
                                    opacity: 1.0
                                });
                            } else if (config.name === 'Jellyfish') {
                                const isHead = lowerName.includes('head') || lowerName.includes('bell') || lowerName.includes('top') || lowerName.includes('umbrella');
                                const isTentacle = lowerName.includes('tentacle') || lowerName.includes('string') || lowerName.includes('tail') || lowerName.includes('long');
                                
                                child.material = new THREE.MeshStandardMaterial({
                                    color: isHead ? 0xff3366 : (isTentacle ? 0xcc0033 : 0xff6699), // Vibrant Pink Head, Darker Red Tentacles, Pink Body
                                    map: this.loadTexture('models/jellyfish/d33dc71b1cb2495c8ca853e932a44560_A_pacificseanettle_color.png'),
                                    normalMap: texLoader.load('models/jellyfish/1c6fee613dc84dc7a6ed72c5dce9e28d_A_pacificseanettle_normal.png'),
                                    roughnessMap: texLoader.load('models/jellyfish/30494735e1be4430abf99b02e13c0d36_RGB_pacificseanettle_rough.png'),
                                    roughness: 0.2,
                                    metalness: 0.1,
                                    envMapIntensity: 1.0,
                                    transparent: false, // Fully opaque as requested
                                    opacity: 1.0,
                                    emissive: isHead ? new THREE.Color(0x330011) : new THREE.Color(0x220000),
                                    emissiveIntensity: 0.5,
                                    side: THREE.DoubleSide
                                });
                            } else if (config.name === 'Gourami') {
                                child.material = new THREE.MeshStandardMaterial({
                                    map: this.loadTexture('models/gourami/54eaf75cb74144dc9add0dfd95b14483_A_4K_Gourami_Fish_Blue_Diffuse.png'),
                                    normalMap: texLoader.load('models/gourami/d9ba0be84ca249acb23769d2c40e8f40_N_4K_Gourami_Fish_Blue_Normal.png'),
                                    roughnessMap: texLoader.load('models/gourami/5876e0bbf6024728831b949acd7277f0_R_4K_Gourami_Fish_Blue_Metallic_Roughness.png'),
                                    aoMap: texLoader.load('models/gourami/966281069d84403a9e8e4e87411028dd_R_4K_Gourami_Fish_Blue_AO.png'),
                                    roughness: 1.0,
                                    metalness: 0.2,
                                    envMapIntensity: 1.0,
                                    transparent: false, // Ensure no transparency
                                    opacity: 1.0,
                                    side: THREE.DoubleSide, // Ensure visibility from both sides
                                    depthWrite: true,
                                    depthTest: true
                                });
                            } else if (config.name === 'Sea Creature') {
                                child.material = new THREE.MeshStandardMaterial({
                                    map: this.loadTexture('models/unknown/1985ecec8f04458695ceea918530ce35_RGB_texture_diffuse.png'),
                                    normalMap: texLoader.load('models/unknown/e8cd43f1274b4c80b1971ffa8dcd5ed7_N_texture_normal.png'),
                                    roughnessMap: texLoader.load('models/unknown/445e5350e60c4ff9913f9401b4e9596a_R_texture_roughness.png'),
                                    metalnessMap: texLoader.load('models/unknown/30f1b6a740b34b3caa93fdc258c0d702_R_texture_metallic.png'),
                                    roughness: 1.0,
                                    metalness: 1.0,
                                    envMapIntensity: 2.0,
                                    transparent: false,
                                    opacity: 1.0
                                });
                            } else if (config.name === 'Great White Shark') {
                                child.material = new THREE.MeshStandardMaterial({
                                    map: this.loadTexture('models/shark/52646c54e64041fcb8fe2ca488742981_RGB_great_white_shark_color.png'),
                                    normalMap: texLoader.load('models/shark/07b10039ec1645c5ac3349b7e015bcaf_N_great_white_shark_normal.png'),
                                    roughnessMap: texLoader.load('models/shark/7a75b9c4020f4a3cbab994d421894bb7_R_great_white_shark_rough.png'),
                                    roughness: 0.8,
                                    metalness: 0.1,
                                    envMapIntensity: 2.0,
                                    transparent: false,
                                    opacity: 1.0
                                });
                            } else if (config.name === 'Sea Green Turtle') {
                                child.material = new THREE.MeshStandardMaterial({
                                    map: this.loadTexture('models/turtle/55cdc0252b344fc59f8a416bacfbcc54_RGB_SeaTurtle_Albedo_v2.png'),
                                    normalMap: texLoader.load('models/turtle/1ed79e34833a4d9e9dd53b52abd72564_N_SeaTurtle_Normal.png'),
                                    roughnessMap: texLoader.load('models/turtle/cf21e1811af644deb93a4bccdb2f1283_R_SeaTurtle_Roughness.png'),
                                    aoMap: texLoader.load('models/turtle/2cfdf44f1b284822be3100e43207d5c3_R_SeaTurtle_Ao.png'),
                                    roughness: 1.0,
                                    metalness: 0.0,
                                    envMapIntensity: 2.0,
                                    transparent: false,
                                    opacity: 1.0
                                });
                            } else if (config.name === 'Starfish') {
                                child.material = new THREE.MeshStandardMaterial({
                                    color: 0xff6600, // Vibrant Orange Starfish
                                    map: this.loadTexture('models/starfish/2f3444c8b2c94fc8ae8eba660392721a_RGB_star_model_only_star_BaseColor.png'),
                                    normalMap: texLoader.load('models/starfish/c4c137e1fd654e46b99a92bb5c98a996_N_star_model_only_star_Normal.png'),
                                    roughnessMap: texLoader.load('models/starfish/24537916bce446f1a5e37caac0b29a80_R_star_model_only_star_Roughness.png'),
                                    metalnessMap: texLoader.load('models/starfish/e17ea2c5dab64fd0ba1cced093dcb29c_R_star_model_only_star_Metallic.png'),
                                    roughness: 0.8,
                                    metalness: 0.0,
                                    envMapIntensity: 1.0,
                                    emissive: new THREE.Color(0x331100), // Subtle warm glow
                                    emissiveIntensity: 0.2,
                                    transparent: false,
                                    opacity: 1.0
                                });
                            } else if (config.name === 'Oarfish') {
                                const lowerChildName = child.name.toLowerCase();
                                if (lowerChildName.includes('eye')) {
                                    child.material = new THREE.MeshStandardMaterial({
                                        map: this.loadTexture('models/oarfish/fbccb191e4a04872b64e8b0f98514336_RGB_Regalecus_glesne_low_eye_BaseColor.png'),
                                        normalMap: texLoader.load('models/oarfish/26cd06e236794f0eb7ecd9c9d4ffe0f8_N_Regalecus_glesne_low_eye_Normal.png'),
                                        roughnessMap: texLoader.load('models/oarfish/fa6647868f85469caab195bab24f211e_R_Regalecus_glesne_low_eye_Roughness.png'),
                                        metalnessMap: texLoader.load('models/oarfish/c2868a858b7e41b593ef6e87b452198d_RGB_Regalecus_glesne_low_eye_Metallic.png'),
                                        roughness: 0.05,
                                        metalness: 0.5,
                                        envMapIntensity: 1.0
                                    });
                                } else if (lowerChildName.includes('fin')) {
                                    child.material = new THREE.MeshStandardMaterial({
                                        color: 0xff0000,
                                        emissive: 0xaa0000,
                                        emissiveIntensity: 0.5,
                                        map: this.loadTexture('models/oarfish/bb6a5df390994ba78c92ecfecce9f1ed_RGB_Regalecus_glesne_low_body_BaseColor.png'),
                                        alphaMap: texLoader.load('models/oarfish/e4f6664e02f04a4e95af7b9a28ce028f_A_Regalecus_glesne_alpha.png'),
                                        roughness: 0.3,
                                        metalness: 0.2,
                                        envMapIntensity: 0.5,
                                        transparent: true,
                                        opacity: 1.0,
                                      side: THREE.DoubleSide
                                  });
                              } else if (config.name === 'Stingray') {
                                  child.material = new THREE.MeshStandardMaterial({
                                      map: this.loadTexture('models/stingray/93c965dfed57433b8d491e33bf0f33a0_RGB_Sea_Ray_Stingray_Diffuse.png'),
                                      normalMap: texLoader.load('models/stingray/335894ec98c04293a8fbaabf09faa2aa_N_Sea_Ray_Stingray_Normal.png'),
                                      roughnessMap: texLoader.load('models/stingray/22f6703b2be44683a5b320d837bd702e_R_Sea_Ray_Stingray_Metallic_Roughness.png'),
                                      aoMap: texLoader.load('models/stingray/e2a7da80ab7943ae8ce2d4e352d9c661_R_Sea_Ray_Stingray_AO.png'),
                                      roughness: 1.0,
                                      metalness: 0.1,
                                      envMapIntensity: 1.0,
                                      side: THREE.DoubleSide
                                  });
                              } else {
                                    child.material = new THREE.MeshStandardMaterial({
                                        map: this.loadTexture('models/oarfish/bb6a5df390994ba78c92ecfecce9f1ed_RGB_Regalecus_glesne_low_body_BaseColor.png'),
                                        normalMap: texLoader.load('models/oarfish/3abbc74818d941bdbea33975c0b4eab7_N_Regalecus_glesne_low_body_Normal.png'),
                                        roughnessMap: texLoader.load('models/oarfish/4fff89c104bb416bbd72ddd0c8d129d1_R_Regalecus_glesne_low_body_Roughness.png'),
                                        metalnessMap: texLoader.load('models/oarfish/2ef7d29f7d2a446391c0ecc68b5bf187_RGB_Regalecus_glesne_specular.png'),
                                        roughness: 0.4,
                                        metalness: 0.8,
                                        envMapIntensity: 1.5,
                                        side: THREE.DoubleSide
                                    });
                                }
                            } else if (config.name === 'Bottlenose Dolphin') {
                                child.material = new THREE.MeshStandardMaterial({
                                    map: this.loadTexture('models/dolphin/c90700b9891f401084a6070e171e26e3_RGB_bottlenose_dolphin_color.png'),
                                    normalMap: texLoader.load('models/dolphin/08c49536e43347848423c7a51e7c4c68_N_bottlenose_dolphin_normal.png'),
                                    roughnessMap: texLoader.load('models/dolphin/7c8f13a4f8e44aa08ef99ba7fc5eac03_R_bottlenose_dolphin_rough.png'),
                                    metalnessMap: texLoader.load('models/dolphin/85b68f5095c241599f5ae7c882a152fe_RGB_bottlenose_dolphin_spec.png'),
                                    roughness: 0.8,
                                    metalness: 0.1,
                                     envMapIntensity: 1.0,
                                     transparent: false,
                                     opacity: 1.0
                                 });
                             } else if (config.name === 'Clownfish') {
                                 child.material = new THREE.MeshStandardMaterial({
                                     map: this.loadTexture('models/clownfish/d9d749a9d97a4963bd99b2b080eed4fb_RGB_clownfish_COLOR.png'),
                                     normalMap: texLoader.load('models/clownfish/a200d9f8db674b4a8def77c642cd271c_N_clownfish_NRM.png'),
                                     roughnessMap: texLoader.load('models/clownfish/c69d7b1a9da9411ab0afae7bed1b29a7_R_clownfish_ROUGH.png'),
                                     metalnessMap: texLoader.load('models/clownfish/01a0069b31964baa821b9995d4e86370_R_clownfish_SPEC.png'),
                                     roughness: 0.6,
                                     metalness: 0.0,
                                     envMapIntensity: 1.0,
                                     transparent: false,
                                     opacity: 1.0,
                                     side: THREE.DoubleSide
                                 });
                             }
                            
                            // --- SUPPLEMENTARY ADVANCED TEXTURING ---
                            this.applyAdvancedTextures(child, config.name);
                        }
                    });

                    wrapper.userData = {
                        isSeaAnimal: true, // Specific tag for root identification
                        name: config.name,
                        fact: config.fact,
                        sourcePath: config.path, // Store path for reloading
                        animations: gltf.animations, // Store original animations
                        phase: Math.random() * Math.PI * 2,
                        originalPos: wrapper.position.clone(),
                        velocity: new THREE.Vector3((Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 0.05, (Math.random() - 0.5) * 0.1)
                    };

                    this.scene.add(wrapper);
                    this.models.push(wrapper);

                    if (gltf.animations.length > 0) {
                        const mixer = new THREE.AnimationMixer(model);
                        mixer.clipAction(gltf.animations[0]).play();
                        this.mixers.push(mixer);
                    }

                    progressBar.style.width = `${((i + 1) / animalConfigs.length) * 100}%`;
                    resolve();
                }, undefined, (error) => {
                    console.error(`Error loading model ${config.name}:`, error);
                    resolve(); // Resolve anyway to continue with other models
                });
            });
        }
    }

    setupUIEvents() {
        const toggleBtn = document.getElementById('toggle-controls');
        const closeInspectBtn = document.getElementById('close-inspect');

        toggleBtn.addEventListener('click', () => {
            if (this.isInspecting) return;
            this.isFreeSwim = !this.isFreeSwim;
            if (this.isFreeSwim) {
                this.orbitControls.enabled = false;
                toggleBtn.innerText = 'Switch to Orbit Mode';
                this.pointerLockControls.lock();
            } else {
                this.pointerLockControls.unlock();
                this.orbitControls.enabled = true;
                toggleBtn.innerText = 'Switch to Free Swim';
            }
        });

        closeInspectBtn.addEventListener('click', () => {
            this.closeInspectMode();
        });
    }

    onMouseClick(event) {
        if (this.isInspecting) return;

        // Reset mouse for raycasting using window-relative coordinates
        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);
        // Deep search through all models and their children
        const intersects = this.raycaster.intersectObjects(this.scene.children, true);

        for (let i = 0; i < intersects.length; i++) {
            const rootModel = this.getRootModel(intersects[i].object);
            if (rootModel && rootModel.userData.isSeaAnimal) {
                this.openInspectMode(rootModel);
                break;
            }
        }
    }

    getRootModel(object) {
        let current = object;
        // Specifically look for our wrapper group with the isSeaAnimal tag
        while (current.parent && !current.userData.isSeaAnimal) {
            current = current.parent;
        }
        return current.userData.isSeaAnimal ? current : null;
    }

    loadTexture(path) {
        const tex = this.texLoader.load(path);
        tex.colorSpace = THREE.SRGBColorSpace;
        return tex;
    }

    applyAdvancedTextures(child, animalName) {
        if (!child.isMesh || !child.material) return;
        
        const name = animalName.toLowerCase();
        const mat = child.material;
        
        if (name.includes('whale')) {
            mat.map = this.loadTexture('models/whale/517e977d58914f18b1edd559053aa6c3_RGB_BARBS_BaseColor.png');
            mat.normalMap = this.texLoader.load('models/whale/de9c4c2c440c413cbedbc604a0f5fe1a_N_BARBSl_Normal.png');
            mat.roughnessMap = this.texLoader.load('models/whale/3b4cc1debebd41baa0532e97d97ac95b_R_BARBS_Roughness.png');
            mat.aoMap = this.texLoader.load('models/whale/2d54593132d147efa3d80da737484db1_R_Humpback_AOMap.png');
            // Adding alpha map for transparency details if needed
            mat.alphaMap = this.texLoader.load('models/whale/7750183a445e467e9c7f45df0b16e3cf_R_Barbs_Opacity.png');
            mat.roughness = 1.0;
            mat.metalness = 0.1;
        } else if (name.includes('shark')) {
            mat.map = this.loadTexture('models/shark/52646c54e64041fcb8fe2ca488742981_RGB_great_white_shark_color.png');
            mat.normalMap = this.texLoader.load('models/shark/07b10039ec1645c5ac3349b7e015bcaf_N_great_white_shark_normal.png');
            mat.roughnessMap = this.texLoader.load('models/shark/7a75b9c4020f4a3cbab994d421894bb7_R_great_white_shark_rough.png');
            // Sharks have rough skin, not metallic
            mat.roughness = 1.0;
            mat.metalness = 0.0;
        } else if (name.includes('jellyfish')) {
            const lowerChildName = child.name.toLowerCase();
            const isHead = lowerChildName.includes('head') || lowerChildName.includes('bell') || lowerChildName.includes('top') || lowerChildName.includes('umbrella');
            const isTentacle = lowerChildName.includes('tentacle') || lowerChildName.includes('string') || lowerChildName.includes('tail') || lowerChildName.includes('long');
            
            mat.map = this.loadTexture('models/jellyfish/d33dc71b1cb2495c8ca853e932a44560_A_pacificseanettle_color.png');
            mat.normalMap = this.texLoader.load('models/jellyfish/1c6fee613dc84dc7a6ed72c5dce9e28d_A_pacificseanettle_normal.png');
            mat.roughnessMap = this.texLoader.load('models/jellyfish/30494735e1be4430abf99b02e13c0d36_RGB_pacificseanettle_rough.png');
            // Adding specular map to help with the "wet" look
            mat.metalnessMap = this.texLoader.load('models/jellyfish/6c0959f5246e41ab834da1666aaef039_R_pacificseanettle_spec.png');
            
            mat.color = isHead ? new THREE.Color(0xff3366) : (isTentacle ? new THREE.Color(0xcc0033) : new THREE.Color(0xff6699));
            mat.roughness = 0.2;
            mat.metalness = 0.1;
            mat.transparent = false;
            mat.opacity = 1.0;
            mat.emissive = isHead ? new THREE.Color(0x330011) : new THREE.Color(0x220000);
            mat.emissiveIntensity = 0.5;
            mat.side = THREE.DoubleSide;
        } else if (name.includes('gourami')) {
            mat.map = this.loadTexture('models/gourami/54eaf75cb74144dc9add0dfd95b14483_A_4K_Gourami_Fish_Blue_Diffuse.png');
            mat.normalMap = this.texLoader.load('models/gourami/d9ba0be84ca249acb23769d2c40e8f40_N_4K_Gourami_Fish_Blue_Normal.png');
            mat.roughnessMap = this.texLoader.load('models/gourami/5876e0bbf6024728831b949acd7277f0_R_4K_Gourami_Fish_Blue_Metallic_Roughness.png');
            mat.aoMap = this.texLoader.load('models/gourami/966281069d84403a9e8e4e87411028dd_R_4K_Gourami_Fish_Blue_AO.png');
            // Adding specular map for the scales
            mat.metalnessMap = this.texLoader.load('models/gourami/880879117c6340b79ebc93e19083dd3b_R_4K_Gourami_Fish_Blue_Specular.png');
            mat.roughness = 1.0;
            mat.metalness = 0.2;
            mat.transparent = false; // Solid body
            mat.opacity = 1.0;
            mat.side = THREE.DoubleSide; // Visible from all angles
            mat.depthWrite = true;
            mat.depthTest = true;
        } else if (name.includes('turtle')) {
            mat.map = this.loadTexture('models/turtle/55cdc0252b344fc59f8a416bacfbcc54_RGB_SeaTurtle_Albedo_v2.png');
            mat.normalMap = this.texLoader.load('models/turtle/1ed79e34833a4d9e9dd53b52abd72564_N_SeaTurtle_Normal.png');
            mat.roughnessMap = this.texLoader.load('models/turtle/cf21e1811af644deb93a4bccdb2f1283_R_SeaTurtle_Roughness.png');
            mat.aoMap = this.texLoader.load('models/turtle/2cfdf44f1b284822be3100e43207d5c3_R_SeaTurtle_Ao.png');
            // Adding specular map for the shell
            mat.metalnessMap = this.texLoader.load('models/turtle/5e643c8da70f4392917f1141b9c7e5e9_R_SeaTurtle_Spec.png');
            mat.roughness = 1.0;
            mat.metalness = 0.0;
            mat.transparent = false;
            mat.opacity = 1.0;
            mat.side = THREE.FrontSide;
        } else if (name.includes('starfish')) {
            mat.map = this.loadTexture('models/starfish/2f3444c8b2c94fc8ae8eba660392721a_RGB_star_model_only_star_BaseColor.png');
            mat.normalMap = this.texLoader.load('models/starfish/c4c137e1fd654e46b99a92bb5c98a996_N_star_model_only_star_Normal.png');
            mat.roughnessMap = this.texLoader.load('models/starfish/24537916bce446f1a5e37caac0b29a80_R_star_model_only_star_Roughness.png');
            mat.metalnessMap = this.texLoader.load('models/starfish/e17ea2c5dab64fd0ba1cced093dcb29c_R_star_model_only_star_Metallic.png');
            mat.color = new THREE.Color(0xff6600); // Vibrant Orange
            mat.roughness = 0.8;
            mat.metalness = 0.0;
            mat.emissive = new THREE.Color(0x331100);
            mat.emissiveIntensity = 0.2;
            mat.transparent = false;
            mat.opacity = 1.0;
            mat.side = THREE.FrontSide;
        } else if (name.includes('sea creature') || name.includes('unknown')) {
            mat.map = this.loadTexture('models/unknown/1985ecec8f04458695ceea918530ce35_RGB_texture_diffuse.png');
            mat.normalMap = this.texLoader.load('models/unknown/e8cd43f1274b4c80b1971ffa8dcd5ed7_N_texture_normal.png');
            mat.roughnessMap = this.texLoader.load('models/unknown/445e5350e60c4ff9913f9401b4e9596a_R_texture_roughness.png');
            mat.metalnessMap = this.texLoader.load('models/unknown/30f1b6a740b34b3caa93fdc258c0d702_R_texture_metallic.png');
            mat.roughness = 1.0;
            mat.metalness = 1.0;
        } else if (name.includes('oarfish')) {
            const lowerChildName = child.name.toLowerCase();
            if (lowerChildName.includes('eye')) {
                mat.map = this.loadTexture('models/oarfish/fbccb191e4a04872b64e8b0f98514336_RGB_Regalecus_glesne_low_eye_BaseColor.png');
                mat.normalMap = this.texLoader.load('models/oarfish/26cd06e236794f0eb7ecd9c9d4ffe0f8_N_Regalecus_glesne_low_eye_Normal.png');
                mat.roughnessMap = this.texLoader.load('models/oarfish/fa6647868f85469caab195bab24f211e_R_Regalecus_glesne_low_eye_Roughness.png');
                mat.metalnessMap = this.texLoader.load('models/oarfish/c2868a858b7e41b593ef6e87b452198d_RGB_Regalecus_glesne_low_eye_Metallic.png');
                mat.roughness = 0.05;
                mat.metalness = 0.5;
            } else if (lowerChildName.includes('fin')) {
                // Vibrant red for all fins/crest as seen in the image
                mat.color = new THREE.Color(0xff0000); 
                mat.emissive = new THREE.Color(0xaa0000);
                mat.emissiveIntensity = 0.5;
                mat.map = this.loadTexture('models/oarfish/bb6a5df390994ba78c92ecfecce9f1ed_RGB_Regalecus_glesne_low_body_BaseColor.png');
                mat.alphaMap = this.texLoader.load('models/oarfish/e4f6664e02f04a4e95af7b9a28ce028f_A_Regalecus_glesne_alpha.png');
                mat.transparent = true;
                mat.side = THREE.DoubleSide;
                mat.roughness = 0.3;
                mat.metalness = 0.2;
            } else {
                // Silvery body with dark spots
                mat.map = this.loadTexture('models/oarfish/bb6a5df390994ba78c92ecfecce9f1ed_RGB_Regalecus_glesne_low_body_BaseColor.png');
                mat.normalMap = this.texLoader.load('models/oarfish/3abbc74818d941bdbea33975c0b4eab7_N_Regalecus_glesne_low_body_Normal.png');
                mat.roughnessMap = this.texLoader.load('models/oarfish/4fff89c104bb416bbd72ddd0c8d129d1_R_Regalecus_glesne_low_body_Roughness.png');
                mat.metalnessMap = this.texLoader.load('models/oarfish/2ef7d29f7d2a446391c0ecc68b5bf187_RGB_Regalecus_glesne_specular.png');
                mat.roughness = 0.4; // More silvery/glossy than before
                mat.metalness = 0.8; // High metalness for that chrome look
                mat.envMapIntensity = 1.5; // Boost reflections for the silvery look
                mat.side = THREE.DoubleSide; // Visible from both sides
            }
        } else if (name.includes('dolphin')) {
            mat.map = this.loadTexture('models/dolphin/c90700b9891f401084a6070e171e26e3_RGB_bottlenose_dolphin_color.png');
            mat.normalMap = this.texLoader.load('models/dolphin/08c49536e43347848423c7a51e7c4c68_N_bottlenose_dolphin_normal.png');
            mat.roughnessMap = this.texLoader.load('models/dolphin/7c8f13a4f8e44aa08ef99ba7fc5eac03_R_bottlenose_dolphin_rough.png');
            mat.metalnessMap = this.texLoader.load('models/dolphin/85b68f5095c241599f5ae7c882a152fe_RGB_bottlenose_dolphin_spec.png');
            mat.roughness = 0.8;
            mat.metalness = 0.1;
            mat.envMapIntensity = 1.0;
        } else if (name.includes('clownfish')) {
            mat.map = this.loadTexture('models/clownfish/d9d749a9d97a4963bd99b2b080eed4fb_RGB_clownfish_COLOR.png');
            mat.normalMap = this.texLoader.load('models/clownfish/a200d9f8db674b4a8def77c642cd271c_N_clownfish_NRM.png');
            mat.roughnessMap = this.texLoader.load('models/clownfish/c69d7b1a9da9411ab0afae7bed1b29a7_R_clownfish_ROUGH.png');
            mat.metalnessMap = this.texLoader.load('models/clownfish/01a0069b31964baa821b9995d4e86370_R_clownfish_SPEC.png');
            mat.roughness = 0.6;
            mat.metalness = 0.0;
            mat.envMapIntensity = 1.0;
            mat.side = THREE.DoubleSide;
        } else if (name.includes('stingray')) {
            mat.map = this.loadTexture('models/stingray/93c965dfed57433b8d491e33bf0f33a0_RGB_Sea_Ray_Stingray_Diffuse.png');
            mat.normalMap = this.texLoader.load('models/stingray/335894ec98c04293a8fbaabf09faa2aa_N_Sea_Ray_Stingray_Normal.png');
            mat.roughnessMap = this.texLoader.load('models/stingray/22f6703b2be44683a5b320d837bd702e_R_Sea_Ray_Stingray_Metallic_Roughness.png');
            mat.aoMap = this.texLoader.load('models/stingray/e2a7da80ab7943ae8ce2d4e352d9c661_R_Sea_Ray_Stingray_AO.png');
            // Adding specular map for the wet look
            mat.metalnessMap = this.texLoader.load('models/stingray/88f3e7f61f63434e91c29646ba614688_R_Sea_Ray_Stingray_Specular.png');
            mat.roughness = 1.0;
            mat.metalness = 0.1;
            mat.envMapIntensity = 1.0;
            mat.side = THREE.DoubleSide;
        }
        
        mat.needsUpdate = true;
    }

    openInspectMode(model) {
        this.isInspecting = true;
        this.isFreeSwim = false;
        
        // --- 1. PREPARE INTERFACE ---
        this.pointerLockControls.unlock();
        this.orbitControls.enabled = false;
        this.inspectControls.enabled = true;
        this.inspectContainer.classList.remove('hidden');
        document.getElementById('ui-overlay').classList.add('hidden');
        document.getElementById('reticle').classList.add('hidden');
        document.getElementById('inspect-name').innerText = model.userData.name;
        document.getElementById('inspect-fact').innerText = model.userData.fact || "Exploring this majestic creature.";

        // --- 2. CLEAN PREVIOUS STATE ---
        if (this.inspectModel) this.inspectScene.remove(this.inspectModel);
        if (this.inspectMixer) this.inspectMixer.stopAllAction();

        // --- 3. LOAD ACTUAL MODEL FROM SOURCE ---
        // Instead of cloning a potentially static instance, we reload from original source
        const loader = new GLTFLoader();
        const modelPath = model.userData.sourcePath || 'models/shark.glb'; // Fallback if path missing

        loader.load(modelPath, (gltf) => {
            const loadedModel = gltf.scene;
            
            // --- 4. PERFECT PIVOT CENTERING ---
            const box = new THREE.Box3().setFromObject(loadedModel);
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            
            // Offset the inner model so its volume center is at (0,0,0)
            loadedModel.position.set(-center.x, -center.y, -center.z);

            // Apply orientation fix specifically for Oarfish in Inspect Mode too
             if (model.userData.name === 'Oarfish') {
                 loadedModel.rotation.set(Math.PI, Math.PI, 0);
             }

            // Create pivot group
            this.inspectModel = new THREE.Group();
            this.inspectModel.add(loadedModel);
            this.inspectScene.add(this.inspectModel);

            // Normalize scale
            const maxDim = Math.max(size.x, size.y, size.z) || 1;
            const scaleFactor = 15 / maxDim;
            this.inspectModel.scale.setScalar(scaleFactor);
            this.inspectModel.userData.baseScale = scaleFactor;
            this.inspectModel.userData.phase = 0;

            // Visual Polish
            loadedModel.traverse(child => {
                child.layers.set(0);
                
                // Hide common utility or occluder meshes that might be in GLTF files
                const lowerName = child.name.toLowerCase();
                if (lowerName.includes('occluder') || lowerName.includes('shell') || lowerName.includes('box') || lowerName.includes('collider')) {
                    child.visible = false;
                    return;
                }

                // --- SET EYES TO DARK BLACK (REALISM) ---
                if (lowerName.includes('eye') || lowerName.includes('pupil') || lowerName.includes('iris') || lowerName.includes('cornea')) {
                    if (child.isMesh && child.material) {
                        child.material = new THREE.MeshStandardMaterial({
                            color: 0x010101, // Deep Dark Black
                            roughness: 0.05, // Glossy reflection
                            metalness: 0.2,
                            envMapIntensity: 1.0
                        });
                    }
                    return;
                }

                // Keep original teeth colors
                if (lowerName.includes('teeth') || lowerName.includes('tooth')) {
                    if (child.isMesh && child.material) {
                        child.material = child.material.clone();
                        child.material.envMapIntensity = 0.5; // Reduce reflection on teeth to see their color
                    }
                    return;
                }

                // --- APPLY VIBRANT BLOOD RED TO INTERNAL PARTS (REALISM) ---
                const internalKeywords = ['mouth', 'throat', 'inner', 'tongue', 'gills', 'stomach', 'flesh', 'oral', 'cavity', 'interior', 'gum'];
                if (internalKeywords.some(kw => lowerName.includes(kw))) {
                    child.material = new THREE.MeshStandardMaterial({
                        color: 0xcc0000, // Vibrant red for obvious mouth interior
                        roughness: 0.2, 
                        metalness: 0.0,
                        envMapIntensity: 0.0, 
                        side: THREE.DoubleSide
                    });
                    return;
                }

                if (child.isMesh && child.material) {
                    child.material = child.material.clone();
                    
                    // --- APPLY ADVANCED HD TEXTURES ---
                    this.applyAdvancedTextures(child, model.userData.name);
                    
                    child.material.envMapIntensity = 0.2; // Drastically reduced to prevent metallic look
                    child.material.roughness = 1.0; // Ensure matte finish for skin
                    child.material.metalness = 0.0; // Ensure no metallic sheen
                    child.material.side = THREE.FrontSide;
                    child.material.transparent = child.material.transparent || lowerName.includes('glass') || lowerName.includes('water');
                    child.material.needsUpdate = true;
                }
            });

            // --- 5. ANIMATIONS (Fresh from source) ---
            if (gltf.animations && gltf.animations.length > 0) {
                this.inspectMixer = new THREE.AnimationMixer(loadedModel);
                const action = this.inspectMixer.clipAction(gltf.animations[0]);
                action.setEffectiveTimeScale(0.5); 
                action.play();
            }

            // Camera Reset
            this.inspectCamera.position.set(0, 5, 30);
            this.inspectControls.reset();
            this.inspectControls.target.set(0, 0, 0);
            this.inspectControls.update();

        }, undefined, (error) => {
            console.error("Error reloading model for Inspect Mode:", error);
            // Fallback to cloning if reload fails
            const fallback = model.clone();
            this.inspectModel = new THREE.Group();
            this.inspectModel.add(fallback);
            this.inspectScene.add(this.inspectModel);
        });
    }

    closeInspectMode() {
        this.isInspecting = false;
        this.isFreeSwim = true;
        
        // --- 1. UI & CONTROL STATE ---
        this.inspectContainer.classList.add('hidden');
        document.getElementById('ui-overlay').classList.remove('hidden');
        document.getElementById('reticle').classList.remove('hidden');
        this.inspectControls.enabled = false;

        // --- 2. CLEANUP ---
        if (this.inspectMixer) {
            this.inspectMixer.stopAllAction();
            this.inspectMixer = null;
        }
        if (this.inspectModel) {
            this.inspectScene.remove(this.inspectModel);
            this.inspectModel = null;
        }

        // --- 3. RESUME MAIN SCENE ---
        this.pointerLockControls.lock();
    }

    onWindowResize() {
        const width = window.innerWidth;
        const height = window.innerHeight;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        
        this.inspectCamera.aspect = width / height;
        this.inspectCamera.updateProjectionMatrix();

        this.renderer.setSize(width, height);
    }

    checkCollisions() {
        // Floor collision
        if (this.camera.position.y < -380) this.camera.position.y = -380;
        if (this.camera.position.y > 1000) this.camera.position.y = 1000;
        
        // Bounds collision
        const limit = 2500;
        if (Math.abs(this.camera.position.x) > limit) this.camera.position.x = Math.sign(this.camera.position.x) * limit;
        if (Math.abs(this.camera.position.z) > limit) this.camera.position.z = Math.sign(this.camera.position.z) * limit;
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        const delta = this.clock.getDelta();
        const time = this.clock.getElapsedTime();

        if (this.isInspecting) {
            // Update Inspect Animation Mixer ( creature's movement )
            if (this.inspectMixer) {
                this.inspectMixer.update(delta);
            }

            // Update headlight to follow camera
            if (this.inspectHeadlight && this.inspectCamera) {
                this.inspectHeadlight.position.copy(this.inspectCamera.position);
            }

            // --- STABLE 3D EXPLORATION MANNER ---
            if (this.inspectModel) {
                this.inspectModel.userData.phase += delta;
                const p = this.inspectModel.userData.phase;

                // 1. Hard Center Lock
                // We keep the group at (0,0,0) and only bob the model inside it
                // BUT to maintain perfect pivot during bobbing, we must sync the target
                const bob = Math.sin(p * 0.5) * 0.4;
                this.inspectModel.position.y = bob;
                
                // CRITICAL: Update the OrbitControls target to follow the model's bobbing
                // This ensures that the rotation axis is ALWAYS at the center of the model.
                this.inspectControls.target.set(0, bob, 0);

                // 2. Real-Life Breathing (Subtle scale pulse)
                const pulse = 1.0 + Math.sin(p * 1.2) * 0.012;
                this.inspectModel.scale.setScalar(this.inspectModel.userData.baseScale * pulse);

                // 3. Subtle Current Sway (Realism)
                const sway = Math.sin(p * 0.4) * 0.025;
                this.inspectModel.rotation.z = sway;
            }

            // 4. Animate Marine Snow (Particles)
            if (this.inspectParticles) {
                this.inspectParticles.rotation.y += delta * 0.05;
                this.inspectParticles.position.y += Math.sin(time * 0.5) * 0.01;
            }

            this.inspectControls.update();
            this.renderer.render(this.inspectScene, this.inspectCamera);
            return; 
        }

        // Update mixers
        for (const mixer of this.mixers) {
            mixer.update(delta);
        }

        // Update controls
        if (this.isFreeSwim && this.pointerLockControls.isLocked) {
            // Smooth acceleration with drag
            this.velocity.x *= this.DRAG;
            this.velocity.y *= this.DRAG;
            this.velocity.z *= this.DRAG;

            this.direction.z = Number(this.moveForward) - Number(this.moveBackward);
            this.direction.x = Number(this.moveRight) - Number(this.moveLeft);
            this.direction.y = Number(this.moveUp) - Number(this.moveDown);
            this.direction.normalize();

            if (this.moveForward || this.moveBackward) this.velocity.z -= this.direction.z * this.ACCEL * delta;
            if (this.moveLeft || this.moveRight) this.velocity.x -= this.direction.x * this.ACCEL * delta;
            if (this.moveUp || this.moveDown) this.velocity.y -= this.direction.y * this.ACCEL * delta;

            this.pointerLockControls.moveRight(-this.velocity.x * delta);
            this.pointerLockControls.moveForward(-this.velocity.z * delta);
            this.camera.position.y += this.velocity.y * delta;

            this.checkCollisions();
            
            // Subtle camera sway
            this.camera.position.y += Math.sin(time * 0.5) * 0.05;
            this.camera.rotation.z += Math.cos(time * 0.5) * 0.0005;
        }

        if (this.orbitControls.enabled) {
            this.orbitControls.update();
        }

        // Animate models (Slow swimming and floating)
        for (const model of this.models) {
            const userData = model.userData;
            
            // Slow swimming
            model.position.addScaledVector(userData.velocity, 1.0);
            
            // Bounce back if out of bounds
            if (Math.abs(model.position.x) > 1500) userData.velocity.x *= -1;
            if (Math.abs(model.position.z) > 1500) userData.velocity.z *= -1;
            
            // Floating effect
            model.position.y += Math.sin(time + userData.phase) * 0.05;
            model.rotation.y += userData.velocity.x * 0.1;
            model.rotation.z = Math.sin(time * 0.5 + userData.phase) * 0.1;
        }

        // Animate bubbles
        if (this.bubbles) {
            this.bubbles.children.forEach(bubble => {
                bubble.position.y += bubble.userData.speed;
                if (bubble.position.y > 500) bubble.position.y = -500;
                bubble.position.x += Math.sin(time + bubble.position.y) * 0.1;
            });
        }

        this.renderer.render(this.scene, this.camera);
    }
}

// Start the application
new SeaExplorer();

