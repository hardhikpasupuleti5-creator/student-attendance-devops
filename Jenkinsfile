pipeline {
    agent any

    environment {
        IMAGE_NAME = "student-attendance-app"
        IMAGE_TAG  = "latest"
    }

    stages {
        stage('Checkout Source Code') {
            steps {
                checkout scm
            }
        }

        stage('Install Dependencies') {
            steps {
                bat 'npm install'
            }
        }

        stage('Run Automated Selenium Tests') {
            steps {
                bat 'npm test'
            }
        }

        stage('Build Docker Image') {
            steps {
                bat 'docker build -t %IMAGE_NAME%:%IMAGE_TAG% .'
            }
        }

        stage('Deploy to Kubernetes') {
            steps {
                bat 'kubectl apply -f k8s-deployment.yaml'
                bat 'kubectl rollout status deployment/student-attendance-deployment'
            }
        }
    }

    post {
        success {
            echo 'Pipeline succeeded! Student Attendance System deployed and verified.'
        }
        failure {
            echo 'Pipeline failed. Check test or deployment logs.'
        }
    }
}