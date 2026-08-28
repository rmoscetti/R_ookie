args <- commandArgs(trailingOnly = TRUE)

if (length(args) < 2L || !nzchar(trimws(args[[1L]])) || !nzchar(trimws(args[[2L]]))) {
  stop("Usage: search_help.R <query|ALL> <package|AUTO>", call. = FALSE)
}

query <- trimws(args[[1L]])
package_value <- trimws(args[[2L]])
query <- sub("\\s*\\(\\s*\\)\\s*$", "", query, perl = TRUE)

if (!nzchar(query)) {
  stop("The search query is empty after normalization.", call. = FALSE)
}

is_auto <- !nzchar(package_value) || identical(toupper(package_value), "AUTO")
if (is_auto) {
  package_value <- "AUTO"
  package_version <- "AUTO"
} else {
  package_path <- tryCatch(
    find.package(package_value, quiet = TRUE),
    error = function(e) character()
  )

  if (length(package_path) == 0L || !nzchar(package_path[[1L]])) {
    stop(sprintf("Package '%s' is not installed.", package_value), call. = FALSE)
  }

  package_version <- tryCatch(
    as.character(utils::packageVersion(package_value)),
    error = function(e) NA_character_
  )

  if (is.na(package_version)) {
    stop(sprintf("Could not determine the installed version of package '%s'.", package_value), call. = FALSE)
  }
}

r_version <- paste(R.version$major, R.version$minor, sep = ".")
all_mode <- identical(toupper(query), "ALL")

search_once <- function(pattern, is_auto) {
  result <- suppressWarnings(
    if (is_auto) {
      utils::help.search(
        pattern = pattern,
        ignore.case = TRUE
      )
    } else {
      utils::help.search(
        pattern = pattern,
        package = package_value,
        ignore.case = TRUE
      )
    }
  )

  matches <- result$matches
  if (is.null(matches) || length(matches) == 0L || nrow(matches) == 0L) return(NULL)

  matches <- as.data.frame(matches, stringsAsFactors = FALSE)
  needed <- c("Topic", "Package", "Title")
  missing_cols <- setdiff(needed, names(matches))
  if (length(missing_cols) > 0L) {
    stop(
      sprintf(
        "Unexpected help.search() result: missing columns %s.",
        paste(missing_cols, collapse = ", ")
      ),
      call. = FALSE
    )
  }

  if (!is_auto) {
    matches <- matches[matches$Package == package_value, , drop = FALSE]
    if (nrow(matches) == 0L) return(NULL)
  }

  matches$Topic <- trimws(as.character(matches$Topic))
  matches$Package <- trimws(as.character(matches$Package))
  matches$Title <- trimws(as.character(matches$Title))
  matches <- matches[nzchar(matches$Topic) & nzchar(matches$Package), , drop = FALSE]
  if (nrow(matches) == 0L) return(NULL)
  # Keep only needed columns
  if (is_auto) {
    matches <- matches[, c("Topic", "Package", "Title"), drop = FALSE]
  } else {
    matches <- matches[, c("Topic", "Package", "Title"), drop = FALSE]
  }
  unique(matches)
}

if (all_mode) {
  matches <- search_once(".", is_auto)
  if (!is.null(matches)) matches$Score <- 1L
} else {
  terms <- unlist(strsplit(query, "[^[:alnum:]_.]+", perl = TRUE), use.names = FALSE)
  terms <- unique(terms[nzchar(terms) & nchar(terms) >= 2L])
  if (length(terms) == 0L) terms <- query

  scored <- list()

  for (term in terms) {
    current <- search_once(term, is_auto)
    if (is.null(current) || nrow(current) == 0L) next
    current$term <- term
    scored[[length(scored) + 1L]] <- current
  }

  if (length(scored) == 0L) {
    matches <- NULL
  } else {
    stacked <- do.call(rbind, scored)
    key <- paste(stacked$Topic, stacked$Package, stacked$Title, sep = "\u001f")
    counts <- table(key)
    first_rows <- !duplicated(key)
    matches <- stacked[first_rows, c("Topic", "Package", "Title"), drop = FALSE]
    match_keys <- key[first_rows]
    matches$Score <- as.integer(counts[match_keys])

    query_lower <- tolower(query)
    exact_topic <- tolower(matches$Topic) == query_lower
    title_contains_query <- grepl(query_lower, tolower(matches$Title), fixed = TRUE)
    matches$Score <- matches$Score + ifelse(exact_topic, 10L, 0L) + ifelse(title_contains_query, 5L, 0L)
  }
}

cat(sprintf("QUERY: %s\n", query))
cat(sprintf("PACKAGE: %s\n", package_value))
cat(sprintf("R_VERSION: %s\n", r_version))
cat(sprintf("PACKAGE_VERSION: %s\n", package_version))

if (is.null(matches) || nrow(matches) == 0L) {
  cat("STATUS: NO_MATCHES\n")
  cat("MATCH_COUNT: 0\n")
  if (!all_mode) {
    cat("FALLBACK: rerun with query ALL to list documented topics in this package\n")
  }
  quit(save = "no", status = 0L)
}

matches <- matches[order(-matches$Score, tolower(matches$Topic), tolower(matches$Package), tolower(matches$Title)), , drop = FALSE]
max_results <- if (all_mode) 200L else 50L
shown <- min(nrow(matches), max_results)

cat("STATUS: MATCHES\n")
cat(sprintf("MATCH_COUNT: %d\n", nrow(matches)))
cat(sprintf("MATCHES_SHOWN: %d\n", shown))

for (i in seq_len(shown)) {
  title <- gsub("[\\r\\n|]+", " ", matches$Title[[i]], perl = TRUE)
  topic_value <- gsub("[\\r\\n|]+", " ", matches$Topic[[i]], perl = TRUE)
  package_val <- gsub("[\\r\\n|]+", " ", matches$Package[[i]], perl = TRUE)
  cat(sprintf("MATCH: %s::%s | %s | SCORE: %d\n", package_val, topic_value, title, matches$Score[[i]]))
}

if (nrow(matches) > shown) {
  cat(sprintf("TRUNCATED: %d additional matches not shown\n", nrow(matches) - shown))
}
