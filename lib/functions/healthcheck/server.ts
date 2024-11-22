import express, { Application } from 'express';

export default class HealthCheckServer {
    public app: Application;
    public port = 3000;

    constructor() {
        this.app = express()
    }

    start() {
        this.app.get('/health', (req, res) => {
            res.status(200).send('OK\n')
        });

        this.app.listen(this.port, () => {
            console.log(`Server listening on port ${this.port}`);
        });
    }
}
