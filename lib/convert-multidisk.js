const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

class MultiDiskConverter {
    constructor() {
        this.tempDir = path.join(process.cwd(), 'temp-conversion');
    }

    async convertMultiDiskOLM(basePath, outputPath) {
        try {
            await this.ensureDirectory(this.tempDir);
            
            const multiDiskFiles = await this.findMultiDiskFiles(basePath);
            
            if (multiDiskFiles.length === 0) {
                throw new Error('No multi-disk files found');
            }
            
            console.log(`Found ${multiDiskFiles.length} multi-disk files`);
            
            if (this.hasZipCommand()) {
                return await this.convertWithZip(multiDiskFiles, outputPath);
            } else if (this.has7zipCommand()) {
                return await this.convertWith7zip(multiDiskFiles, outputPath);
            } else {
                throw new Error('No suitable extraction tool found. Please install zip or 7zip.');
            }
        } catch (error) {
            console.error('Conversion failed:', error.message);
            throw error;
        } finally {
            await this.cleanup();
        }
    }

    async findMultiDiskFiles(basePath) {
        const fileName = path.basename(basePath, '.olm');
        const dir = path.dirname(basePath);
        
        const files = fs.readdirSync(dir);
        const multiDiskPattern = new RegExp(`^${fileName}\.z\\d{2}$`);
        
        const multiDiskFiles = files
            .filter(file => multiDiskPattern.test(file))
            .map(file => path.join(dir, file))
            .sort();
        
        multiDiskFiles.unshift(basePath);
        
        return multiDiskFiles;
    }

    hasZipCommand() {
        try {
            require('child_process').execSync('which zip', { stdio: 'ignore' });
            return true;
        } catch {
            return false;
        }
    }

    has7zipCommand() {
        try {
            require('child_process').execSync('which 7z', { stdio: 'ignore' });
            return true;
        } catch {
            return false;
        }
    }

    async convertWithZip(multiDiskFiles, outputPath) {
        return new Promise((resolve, reject) => {
            const firstFile = multiDiskFiles[0];
            const command = `cd "${path.dirname(firstFile)}" && zip -FF "${path.basename(firstFile)}" --out "${outputPath}"`;
            
            exec(command, (error, stdout, stderr) => {
                if (error) {
                    reject(new Error(`Zip conversion failed: ${error.message}`));
                } else {
                    console.log('Zip conversion completed successfully');
                    resolve(outputPath);
                }
            });
        });
    }

    async convertWith7zip(multiDiskFiles, outputPath) {
        return new Promise((resolve, reject) => {
            const firstFile = multiDiskFiles[0];
            const command = `7z x "${firstFile}" -o"${this.tempDir}" && cd "${this.tempDir}" && 7z a "${outputPath}" *`;
            
            exec(command, (error, stdout, stderr) => {
                if (error) {
                    reject(new Error(`7zip conversion failed: ${error.message}`));
                } else {
                    console.log('7zip conversion completed successfully');
                    resolve(outputPath);
                }
            });
        });
    }

    async ensureDirectory(dirPath) {
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }
    }

    async cleanup() {
        try {
            if (fs.existsSync(this.tempDir)) {
                fs.rmSync(this.tempDir, { recursive: true, force: true });
            }
        } catch (error) {
            console.warn('Cleanup failed:', error.message);
        }
    }
}

module.exports = MultiDiskConverter;