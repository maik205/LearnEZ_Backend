import { FirebaseApp } from "firebase/app";
import { User } from "firebase/auth";
import { defaultGenerationConfig, RoadmapGenerationConfig } from "./types/roadmap.config";

export class RoadmapService {
    private app: FirebaseApp;
    constructor(app: FirebaseApp) {
        this.app = app;
    }

    public ingestPDF(data: Blob, user: User, config: RoadmapGenerationConfig = defaultGenerationConfig) {
    }
}
