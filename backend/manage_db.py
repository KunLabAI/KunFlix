import sys
import os
import subprocess
import argparse

# Ensure we are in the backend directory
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
os.chdir(BACKEND_DIR)

def run_command(command):
    """Run a shell command and print output."""
    print(f"Running: {command}")
    try:
        subprocess.check_call(command, shell=True)
        print("Success!")
    except subprocess.CalledProcessError as e:
        print(f"Error running command: {e}")
        sys.exit(1)

def migrate(message):
    """Create a new migration revision with autogenerate."""
    if not message:
        print("Error: Migration message is required.")
        sys.exit(1)
    
    # Use python -m alembic to ensure we use the current python environment
    cmd = f'python -m alembic revision --autogenerate -m "{message}"'
    run_command(cmd)

def upgrade():
    """Apply all pending migrations."""
    cmd = "python -m alembic upgrade head"
    run_command(cmd)

def downgrade():
    """Revert the last migration."""
    cmd = "python -m alembic downgrade -1"
    run_command(cmd)

def main():
    parser = argparse.ArgumentParser(description="Database Migration Manager")
    subparsers = parser.add_subparsers(dest="command", help="Command to run")

    # Migrate command
    migrate_parser = subparsers.add_parser("migrate", help="Create a new migration based on model changes")
    migrate_parser.add_argument("message", help="Description of the changes")

    # Upgrade command
    subparsers.add_parser("upgrade", help="Apply all pending migrations to the database")

    # Downgrade command
    subparsers.add_parser("downgrade", help="Revert the last applied migration")

    # Seed command
    subparsers.add_parser("seed", help="Seed the database with initial data")

    args = parser.parse_args()

    if args.command == "migrate":
        migrate(args.message)
    elif args.command == "upgrade":
        upgrade()
    elif args.command == "downgrade":
        downgrade()
    elif args.command == "seed":
        print("Running seed script...")
        cmd = f"{sys.executable} seed_db.py"
        print(f"Running: {cmd}")
        try:
            subprocess.check_call(cmd, shell=True)
            print("Seed completed successfully!")
        except subprocess.CalledProcessError as e:
            print(f"Failed to seed database: {e}")
            sys.exit(1)
    else:
        parser.print_help()

if __name__ == "__main__":
    main()
