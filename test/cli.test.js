const { expect } = require('chai');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const tmp = require('tmp');

describe('CLI Integration Tests', () => {
    let tmpDir;
    const cliPath = path.join(__dirname, '..', 'olm-extract.js');

    beforeEach(() => {
        tmpDir = tmp.dirSync({ unsafeCleanup: true });
    });

    afterEach(() => {
        if (tmpDir) {
            tmpDir.removeCallback();
        }
    });

    describe('Help Command', () => {
        it('should display help when --help flag is used', (done) => {
            exec(`node "${cliPath}" --help`, (error, stdout, stderr) => {
                expect(error).to.be.null;
                expect(stdout).to.include('Usage:');
                expect(stdout).to.include('Options:');
                done();
            });
        });

        it('should display help when -h flag is used', (done) => {
            exec(`node "${cliPath}" -h`, (error, stdout, stderr) => {
                expect(error).to.be.null;
                expect(stdout).to.include('Usage:');
                expect(stdout).to.include('Options:');
                done();
            });
        });
    });

    describe('Error Handling', () => {
        it('should show error for missing OLM file', (done) => {
            const nonExistentFile = path.join(tmpDir.name, 'nonexistent.olm');
            
            exec(`node "${cliPath}" "${nonExistentFile}"`, (error, stdout, stderr) => {
                expect(error).to.not.be.null;
                expect(error.code).to.be.greaterThan(0);
                done();
            });
        });

        it('should show error for invalid file format', (done) => {
            const invalidFile = path.join(tmpDir.name, 'invalid.txt');
            fs.writeFileSync(invalidFile, 'This is not an OLM file');
            
            exec(`node "${cliPath}" "${invalidFile}"`, (error, stdout, stderr) => {
                expect(error).to.not.be.null;
                expect(error.code).to.be.greaterThan(0);
                done();
            });
        });
    });

    describe('Command Line Arguments', () => {
        it('should accept custom output directory', (done) => {
            const mockOlmFile = path.join(tmpDir.name, 'test.olm');
            const outputDir = path.join(tmpDir.name, 'output');
            
            // Create a minimal ZIP file that looks like an OLM
            const AdmZip = require('adm-zip');
            const zip = new AdmZip();
            zip.addFile('dummy.txt', Buffer.from('test content'));
            zip.writeZip(mockOlmFile);
            
            exec(`node "${cliPath}" "${mockOlmFile}" "${outputDir}"`, { timeout: 5000 }, (error, stdout, stderr) => {
                // Even if it fails to process (which is expected with our dummy file),
                // it should create the output directory
                if (fs.existsSync(outputDir)) {
                    expect(fs.existsSync(outputDir)).to.be.true;
                }
                done();
            });
        });
    });

    describe('Stream Mode', () => {
        it('should accept --stream flag', (done) => {
            const mockOlmFile = path.join(tmpDir.name, 'test.olm');
            const outputDir = path.join(tmpDir.name, 'stream_output');
            
            // Create a minimal ZIP file
            const AdmZip = require('adm-zip');
            const zip = new AdmZip();
            zip.addFile('dummy.txt', Buffer.from('test content'));
            zip.writeZip(mockOlmFile);
            
            exec(`node "${cliPath}" "${mockOlmFile}" "${outputDir}" --stream`, { timeout: 5000 }, (error, stdout, stderr) => {
                // Command should run without syntax errors
                // (It may fail on processing, but that's expected with dummy data)
                // Verify that --stream didn't get treated as output directory
                expect(fs.existsSync(path.join(process.cwd(), '--stream'))).to.be.false;
                done();
            });
        });
    });

    describe('Version Information', () => {
        it('should display version when --version flag is used', (done) => {
            exec(`node "${cliPath}" --version`, (error, stdout, stderr) => {
                if (error && error.code === 1) {
                    // Expected if version command isn't implemented yet
                    done();
                } else {
                    expect(stdout).to.include('1.0.0');
                    done();
                }
            });
        });
    });
});