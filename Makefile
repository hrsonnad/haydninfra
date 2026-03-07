.PHONY: sync-workflow
sync-workflow:
	@$(HOME)/workflow-kit/bin/sync-into-project.sh .

.PHONY: workflow-status
workflow-status:
	@$(HOME)/workflow-kit/bin/check-sync-status.sh .
