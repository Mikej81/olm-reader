const OLMReader = require('../index.js');

class ConsoleCallback {
    constructor(outputDir = null) {
        this.reader = new OLMReader(outputDir);
        this.setupCallbacks();
    }

    setupCallbacks() {
        // Simple progress tracking without verbose output
        let processedCount = 0;
        
        this.reader.setCallback('email', (email, attachments) => {
            processedCount++;
            if (processedCount % 100 === 0) {
                process.stdout.write(`Processed ${processedCount} emails...\r`);
            }
        });

        // No callbacks for other types to reduce noise
    }

    async read(filePath) {
        try {
            console.log('Reading OLM file:', filePath);
            if (this.reader.outputDir) {
                console.log('Output directory:', this.reader.outputDir);
            }
            await this.reader.readOLMFile(filePath);
            console.log('\nFinished reading OLM file');
            if (this.reader.outputDir) {
                console.log('Counters:', this.reader.counters);
                console.log('Content exported to:', this.reader.outputDir);
            }
        } catch (error) {
            console.error('Error reading OLM file:', error);
        }
    }
}

if (require.main === module) {
    const args = process.argv.slice(2);
    if (args.length === 0) {
        console.log('Usage: node example.js <olm-file-path> [output-directory]');
        console.log('  olm-file-path: Path to the OLM file to read');
        console.log('  output-directory: Optional directory to export content to');
        process.exit(1);
    }

    const filePath = args[0];
    const outputDir = args[1] || null;
    const callback = new ConsoleCallback(outputDir);
    callback.read(filePath);
}

module.exports = ConsoleCallback;